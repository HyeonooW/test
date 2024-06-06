param (
    [string]$photorecPath,
    [string]$imagePath,
    [string]$outputDir
)

$arguments = "/d", "$outputDir", "/cmd", "$imagePath"

Start-Process -FilePath $photorecPath -ArgumentList $arguments -NoNewWindow -Wait

Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Seconds 1
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 1
[System.Windows.Forms.SendKeys]::SendWait("{DOWN}")
Start-Sleep -Seconds 1
[System.Windows.Forms.SendKeys]::SendWait("{DOWN}")
Start-Sleep -Seconds 1
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 1
[System.Windows.Forms.SendKeys]::SendWait("{DOWN}")
Start-Sleep -Seconds 1
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 1
[System.Windows.Forms.SendKeys]::SendWait("{DOWN}")
Start-Sleep -Seconds 1
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
