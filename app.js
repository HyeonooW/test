const express = require("express");
const multer = require("multer");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const ejs = require("ejs");
const mysql = require("mysql2");

const app = express();
const port = 3000;

// Multer 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads/";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "0000",
  database: "file_recovery",
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err.stack);
    return;
  }
  console.log("Connected to database.");
});

app.set("view engine", "html");
app.engine("html", ejs.renderFile);
app.set("views", path.join(__dirname, "views"));

app.get("/", (req, res) => {
  db.query("SELECT * FROM uploads", (err, uploadsResults) => {
    if (err) {
      console.error("Error fetching uploads from DB:", err);
      return res.status(500).send("Internal Server Error");
    }

    db.query("SELECT DISTINCT upload_id FROM output", (err, recoveredResults) => {
      if (err) {
        console.error("Error fetching recovered files from DB:", err);
        return res.status(500).send("Internal Server Error");
      }

      const recoveredFiles = recoveredResults.map((row) => row.upload_id);

      res.render("index", {
        uploads: uploadsResults,
        recoveredFiles: recoveredFiles,
      });
    });
  });
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  const originalFilename = req.file.originalname;
  const filePath = req.file.path;

  db.query(
    "INSERT INTO uploads (original_filename, file_path) VALUES (?, ?)",
    [originalFilename, filePath],
    (err, result) => {
      if (err) {
        console.error("Error saving upload to DB:", err);
        return res.status(500).send("Internal Server Error: " + err.message);
      }
      res.redirect("/");
    }
  );
});

app.get("/recover/:id", (req, res) => {
  app.use(express.static(path.join(__dirname, 'views')));
  const uploadId = req.params.id;

  db.query("SELECT * FROM uploads WHERE id = ?", [uploadId], (err, results) => {
    if (err) {
      console.error("Error fetching upload from DB:", err);
      return res.status(500).send("Internal Server Error");
    }

    if (results.length === 0) {
      return res.status(404).send("File not found");
    }

    const file = results[0];
    const tempFilePath = path.join(__dirname, file.file_path);

    const outputDir = path.join(__dirname, "temp", file.id.toString());
    const recoveredDir = path.join(__dirname, "recovered_files", file.id.toString());
    const logFilePath = path.join(__dirname, `photorec_log_${uploadId}.txt`);
    console.log(`Output Directory: ${outputDir}`);
    console.log(`Recovered Directory: ${recoveredDir}`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!fs.existsSync(recoveredDir)) {
      fs.mkdirSync(recoveredDir, { recursive: true });
    }

    const runPhotoRec = (tempFilePath, outputDir, res, uploadId, recoveredDir) => {
      const photorecPath = path.join("C:\\Users\\admin\\Desktop\\testdisk-7.2", "photorec_win.exe");
      const commandArgs = ["/log", "/d", outputDir, tempFilePath];

      console.log("Executing command:", photorecPath, commandArgs);

      const child = spawn(photorecPath, commandArgs, { shell: true });

      let logData = "";

      child.stdout.on("data", (data) => {
        console.log(`stdout: ${data}`);
        logData += data.toString();
      });

      child.stderr.on("data", (data) => {
        console.error(`stderr: ${data}`);
        logData += data.toString();
      });

      child.on("error", (error) => {
        console.error(`Error running PhotoRec: ${error.message}`);
        res.status(500).send("Internal Server Error");
      });

      child.on("exit", (code) => {
        console.log(`PhotoRec exited with code ${code}`);
        fs.writeFileSync(logFilePath, logData);
        if (code !== 0) {
          console.error(`PhotoRec exited with code ${code}`);
          const logContent = fs.readFileSync(logFilePath, "utf8");
          console.error(`PhotoRec log: ${logContent}`);
          res.status(500).send(`PhotoRec exited with code ${code}\n${logContent}`);
          return;
        }

        setTimeout(() => {
          const getAllFiles = (dirPath, arrayOfFiles) => {
            let files = fs.readdirSync(dirPath);

            arrayOfFiles = arrayOfFiles || [];

            files.forEach((file) => {
              if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
                arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
              } else {
                arrayOfFiles.push(path.join(dirPath, file));
              }
            });

            return arrayOfFiles;
          };

          const recoveredFiles = getAllFiles(outputDir);
          console.log(`Recovered files: ${recoveredFiles}`);

          if (recoveredFiles.length === 0) {
            console.error("No files recovered by PhotoRec.");
            return res.status(500).send("No files recovered");
          }

          const insertRecoveredFiles = async (recoveredFiles) => {
            for (const filePath of recoveredFiles) {
              const filename = path.basename(filePath);
              const destinationPath = path.join(recoveredDir, filename);
              console.log(`Moving file to: ${destinationPath}`);

              fs.renameSync(filePath, destinationPath);

              console.log(`Inserting into DB - File: ${filename}, Path: ${destinationPath}`);

              await new Promise((resolve, reject) => {
                db.query(
                  "INSERT INTO output (upload_id, filename, file_path) VALUES (?, ?, ?)",
                  [uploadId, filename, destinationPath],
                  (err) => {
                    if (err) {
                      console.error("Error saving output to DB:", err);
                      reject(err);
                    } else {
                      console.log(`Successfully inserted - File: ${filename}`);
                      resolve();
                    }
                  }
                );
              });
            }
          };

          insertRecoveredFiles(recoveredFiles)
            .then(() => {
              fs.unlinkSync(tempFilePath);
              fs.rmSync(outputDir, { recursive: true, force: true });

              res.redirect(`/results/${uploadId}`);
            })
            .catch((err) => {
              console.error("Error inserting recovered files:", err);
              res.status(500).send("Internal Server Error");
            });
        }, 5000); // 5초 대기 후 파일 확인
      });
    };

    runPhotoRec(tempFilePath, outputDir, res, file.id, recoveredDir);
  });
});

app.post("/delete/:id", (req, res) => {
  const uploadId = req.params.id;

  db.query("DELETE FROM uploads WHERE id = ?", [uploadId], (err, results) => {
    if (err) {
      console.error("Error deleting upload from DB:", err);
      return res.status(500).send("Internal Server Error");
    }
    res.redirect("/");
  });
});

app.get("/results/:uploadId", (req, res) => {
  const uploadId = req.params.uploadId;

  db.query(
    "SELECT filename, file_path FROM output WHERE upload_id = ?",
    [uploadId],
    (err, results) => {
      if (err) {
        console.error("Error fetching results from DB:", err);
        return res.status(500).send("Internal Server Error");
      }

      const files = results.map((row) => ({
        filename: row.filename,
        filePath: row.file_path,
      }));
      console.log(`Files in results: ${files}`);
      res.render("results", { files });
    }
  );
});

app.get("/download/:uploadId/:filename", (req, res) => {
  const uploadId = req.params.uploadId;
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "recovered_files", uploadId.toString(), filename);

  res.download(filePath, filename, (err) => {
    if (err) {
      console.error("Error downloading file:", err);
      res.status(500).send("Internal Server Error");
    }
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
