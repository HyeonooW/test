param (
    [string]$photorecPath,
    [string]$imagePath,
    [string]$outputDir
)

# 포토렉 명령어 인수 문자열로 작성
$arguments = "/d $outputDir /cmd $imagePath"

# 인수 문자열로 Start-Process 호출
Start-Process -FilePath $photorecPath -ArgumentList $arguments -NoNewWindow -Wait



# 자동으로 키 입력을 위해 Add-Type을 사용합니다.
Add-Type -AssemblyName System.Windows.Forms

# Photorec이 실행된 후 키 입력 시퀀스
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
