<#
Times the offline engine of a built app on a known clip, and fails when it is slow or
mishears. A release build of whisper.cpp compiled without optimization once shipped
seven times slower with nothing else wrong; this stops the next one at the build.

  ./scripts/whisper-benchmark.ps1 -Exe target/release/bible-show-pro.exe -Model ggml-base.en.bin
#>
param(
  [Parameter(Mandatory = $true)] [string]$Exe,
  [Parameter(Mandatory = $true)] [string]$Model,
  [string]$SpeechDetector = "",
  # "Turn with me to Matthew chapter five, verse fourteen." 16 kHz mono, synthesized voice.
  [string]$Clip = (Join-Path $PSScriptRoot "whisper-benchmark.wav"),
  [string]$Expect = "Matthew chapter 5,? verse 14",
  [double]$MaxSeconds = 10,
  [int]$Threads = 4
)
$ErrorActionPreference = "Stop"

function Read-Pcm([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $at = 12
  $format = $null
  while ($at + 8 -le $bytes.Length) {
    $id = [Text.Encoding]::ASCII.GetString($bytes, $at, 4)
    $size = [BitConverter]::ToInt32($bytes, $at + 4)
    if ($id -eq "fmt ") {
      $format = @{
        Channels = [BitConverter]::ToInt16($bytes, $at + 10)
        Rate = [BitConverter]::ToInt32($bytes, $at + 12)
        Bits = [BitConverter]::ToInt16($bytes, $at + 22)
      }
    }
    if ($id -eq "data") {
      if (-not $format -or $format.Channels -ne 1 -or $format.Rate -ne 16000 -or $format.Bits -ne 16) {
        throw "$Path must be 16 kHz mono 16-bit PCM."
      }
      $pcm = New-Object byte[] $size
      [Array]::Copy($bytes, $at + 8, $pcm, 0, $size)
      return , $pcm
    }
    $at += 8 + $size + ($size % 2)
  }
  throw "No audio in $Path."
}

$pcm = Read-Pcm $Clip
$clipSeconds = $pcm.Length / 32000

$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = (Resolve-Path $Exe).Path
$start.Arguments = "--whisper-worker"
$start.UseShellExecute = $false
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
# Windows PowerShell opens the worker's input with the console encoding, byte-order mark
# included, and the worker cannot parse a request that starts with one.
$consoleEncoding = [Console]::InputEncoding
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
try {
  $worker = [Diagnostics.Process]::Start($start)
} finally {
  [Console]::InputEncoding = $consoleEncoding
}
$log = $worker.StandardError.ReadToEndAsync()
$requests = $worker.StandardInput

function Send($request) {
  $requests.WriteLine(($request | ConvertTo-Json -Compress))
  $requests.Flush()
  $line = $worker.StandardOutput.ReadLine()
  if ($null -eq $line) {
    $worker.WaitForExit(5000) | Out-Null
    throw "The worker exited (code $($worker.ExitCode)):`n$($log.Result)"
  }
  $reply = $line | ConvertFrom-Json
  if (-not $reply.ok) { throw "The worker refused: $($reply.error)" }
  return $reply
}

$load = [ordered]@{ op = "load"; path = (Resolve-Path $Model).Path }
if ($SpeechDetector) { $load.speechDetector = (Resolve-Path $SpeechDetector).Path }
$clock = [Diagnostics.Stopwatch]::StartNew()
Send $load | Out-Null
$loadSeconds = $clock.Elapsed.TotalSeconds

$clock.Restart()
$heard = Send ([ordered]@{
  op = "transcribe"
  pcmBase64 = [Convert]::ToBase64String($pcm)
  sampleRate = 16000
  language = "en"
  threads = $Threads
})
$seconds = $clock.Elapsed.TotalSeconds
$requests.Close()
$worker.WaitForExit(10000) | Out-Null

$summary = "Offline engine: model loaded in {0:N1} s; a {1:N1} s clip transcribed in {2:N1} s (limit {3} s). Heard: ""{4}""" -f `
  $loadSeconds, $clipSeconds, $seconds, $MaxSeconds, $heard.text
Write-Host $summary
# The worker's first line says which CPU features whisper.cpp was compiled with.
Write-Host (($log.Result -split "`n") | Select-Object -First 1)
if ($env:GITHUB_STEP_SUMMARY) { Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value $summary }

if ($heard.text -notmatch $Expect) {
  Write-Host $log.Result
  throw "The offline engine misheard the benchmark clip; expected /$Expect/."
}
if ($seconds -gt $MaxSeconds) {
  Write-Host $log.Result
  throw ("The offline engine is too slow: {0:N1} s for a {1:N1} s clip, limit {2} s. Check that whisper.cpp was built with optimization." -f $seconds, $clipSeconds, $MaxSeconds)
}
