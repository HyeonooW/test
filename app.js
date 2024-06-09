const express = require("express");
const multer = require("multer");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const ejs = require("ejs");
const mongoose = require("mongoose");

const app = express();
const port = 3000;

// MongoDB 설정
mongoose.connect("mongodb://admin:0000@svc.sel5.cloudtype.app:30583/")
  .then(() => {
    console.log("MongoDB에 연결되었습니다.");
  })
  .catch((err) => {
    console.error("MongoDB 연결 오류:", err);
  });

// 모델 정의
const UploadSchema = new mongoose.Schema({
  original_filename: String,
  file_path: String,
});

const OutputSchema = new mongoose.Schema({
  upload_id: mongoose.Schema.Types.ObjectId,
  filename: String,
  file_path: String,
});

const Upload = mongoose.model("Upload", UploadSchema);
const Output = mongoose.model("Output", OutputSchema);

// 서버를 MongoDB 연결 후 시작합니다.
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});

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

app.set("view engine", "html");
app.engine("html", ejs.renderFile);
app.set("views", path.join(__dirname, "views"));

app.get("/", async (req, res) => {
  try {
    const uploadsResults = await Upload.find({});
    const recoveredResults = await Output.distinct("upload_id");

    res.render("index", {
      uploads: uploadsResults,
      recoveredFiles: recoveredResults,
    });
  } catch (err) {
    console.error("Error fetching data from DB:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  const originalFilename = req.file.originalname;
  const filePath = req.file.path;

  try {
    await Upload.create({ original_filename: originalFilename, file_path: filePath });
    res.redirect("/");
  } catch (err) {
    console.error("Error saving upload to DB:", err);
    res.status(500).send("Internal Server Error: " + err.message);
  }
});

app.get("/recover/:id", async (req, res) => {
  app.use(express.static(path.join(__dirname, 'views')));
  const uploadId = req.params.id;

  try {
    const file = await Upload.findById(uploadId);
    if (!file) {
      return res.status(404).send("File not found");
    }

    const tempFilePath = path.join(__dirname, file.file_path);
    const outputDir = path.join(__dirname, "temp", file._id.toString());
    const recoveredDir = path.join(__dirname, "recovered_files", file._id.toString());
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
      const photorecPath = "/app/uploads/testdisk-7.2/photorec_win.exe";
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

        setTimeout(async () => {
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

          try {
            for (const filePath of recoveredFiles) {
              const filename = path.basename(filePath);
              const destinationPath = path.join(recoveredDir, filename);
              console.log(`Moving file to: ${destinationPath}`);

              fs.renameSync(filePath, destinationPath);

              console.log(`Inserting into DB - File: ${filename}, Path: ${destinationPath}`);

              await Output.create({ upload_id: uploadId, filename, file_path: destinationPath });
            }
            fs.unlinkSync(tempFilePath);
            fs.rmSync(outputDir, { recursive: true, force: true });

            res.redirect(`/results/${uploadId}`);
          } catch (err) {
            console.error("Error inserting recovered files:", err);
            res.status(500).send("Internal Server Error");
          }
        }, 5000); // 5초 대기 후 파일 확인
      });
    };

    runPhotoRec(tempFilePath, outputDir, res, file._id, recoveredDir);
  } catch (err) {
    console.error("Error fetching upload from DB:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/delete/:id", async (req, res) => {
  const uploadId = req.params.id;

  try {
    await Upload.deleteOne({ _id: uploadId });
    res.redirect("/");
  } catch (err) {
    console.error("Error deleting upload from DB:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/results/:uploadId", async (req, res) => {
  const uploadId = req.params.uploadId;

  try {
    const results = await Output.find({ upload_id: uploadId });

    const files = results.map((row) => ({
      filename: row.filename,
      filePath: row.file_path,
    }));
    console.log(`Files in results: ${files}`);
    res.render("results", { files });
  } catch (err) {
    console.error("Error fetching results from DB:", err);
    res.status(500).send("Internal Server Error");
  }
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