# SPDX-License-Identifier: GPL-3.0-or-later
param([Parameter(Mandatory=$true)][string]$LibraryDirectory,[int]$ParentProcessId=0,[string]$OutputFile='',[switch]$Once,[switch]$EnableTuning)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$computer=$null
$parent=$null
if($ParentProcessId -gt 0){try{$parent=[Diagnostics.Process]::GetProcessById($ParentProcessId)}catch{exit}}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class VortexSensorAccess {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  public static bool Available() {
    using(var handle=CreateFile(@"\\?\GLOBALROOT\Device\PawnIO",0xC0000000,3,IntPtr.Zero,3,0,IntPtr.Zero)) return !handle.IsInvalid;
  }
}
'@
. (Join-Path $PSScriptRoot 'smu.ps1')

function Read-WindowsClock {
  try {
    $rows=@(Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -OperationTimeoutSec 2 | Where-Object {$_.Name -match '^\d+,\d+$' -and $_.ProcessorFrequency -gt 0 -and $_.PercentProcessorPerformance -gt 0})
    $values=@($rows | ForEach-Object { [double]$_.ProcessorFrequency * [double]$_.PercentProcessorPerformance / 100.0 } | Where-Object {$_ -gt 100 -and $_ -lt 10000})
    if($values.Count -gt 0){return @{averageMHz=[double]($values|Measure-Object -Average).Average;peakMHz=[double]($values|Measure-Object -Maximum).Maximum}}
  } catch {}
  return $null
}
function Read-Hardware($hardware) {
  $hardware.Update()
  foreach($sensor in $hardware.Sensors){
    if($null -ne $sensor.Value){[pscustomobject]@{Identifier=[string]$sensor.Identifier;Parent=[string]$hardware.Identifier;Name=[string]$sensor.Name;SensorType=[string]$sensor.SensorType;Value=[double]$sensor.Value}}
  }
  foreach($child in $hardware.SubHardware){Read-Hardware $child}
}
try {
  $assembly=[Reflection.Assembly]::LoadFrom((Join-Path $LibraryDirectory 'LibreHardwareMonitorLib.dll'))
  do {
    if($parent -and $parent.HasExited){break}
    if($OutputFile -and (Test-Path -LiteralPath ($OutputFile+'.stop'))){break}
    $watch=[Diagnostics.Stopwatch]::StartNew()
    $status='ready';$errorText='';$rows=@();$smu=$null
    $installed=(Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO') -or (Test-Path 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO')
    if(-not $installed){$status='driver-missing'}
    elseif(-not [VortexSensorAccess]::Available()){$status='access-denied'}
    else {
      try {
        if(-not $computer){$computer=New-Object LibreHardwareMonitor.Hardware.Computer;$computer.IsCpuEnabled=$true;$computer.Open()}
        $rows=@(foreach($hardware in $computer.Hardware){if([string]$hardware.HardwareType -eq 'Cpu'){Read-Hardware $hardware}})
        try {
          $smu=Read-Smu
          if($EnableTuning){
            $previousReplyId=$script:lastReply.id
            Process-SmuRequest $OutputFile
            if($script:lastReply.id -ne $previousReplyId){$smu=Read-Smu}
          }
        }catch{$smu=@{tuning=@{supported=$false;error=$_.Exception.Message}}}
      }catch{$status='sensor-error';$errorText=$_.Exception.Message;if($computer){try{$computer.Close()}catch{};$computer=$null}}
    }
    $hasNativeClock=$false
    foreach($row in $rows){
      if($row.SensorType -eq 'Clock' -and $row.Value -gt 100 -and $row.Value -lt 10000 -and
         $row.Name -match 'core\s*#?\d+|cores?\s*\(average\)' -and $row.Name -notmatch 'effective'){
        $hasNativeClock=$true
        break
      }
    }
    $clock=if($hasNativeClock){$null}else{Read-WindowsClock}
    $json=(@{sensors=$rows;smu=$smu;windowsClock=$clock;status=$status;error=$errorText;sampledAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}|ConvertTo-Json -Compress -Depth 8)
    if($OutputFile){
      [IO.File]::WriteAllText(($OutputFile+'.tmp'),$json,[Text.UTF8Encoding]::new($false))
      if(Test-Path -LiteralPath $OutputFile){[IO.File]::Replace(($OutputFile+'.tmp'),$OutputFile,($OutputFile+'.bak'))}else{[IO.File]::Move(($OutputFile+'.tmp'),$OutputFile)}
    }else{[Console]::WriteLine($json)}
    if($Once){break}
    Start-Sleep -Milliseconds ([Math]::Max(50,1000-$watch.ElapsedMilliseconds))
  }while($true)
}catch{
  $json=(@{sensors=@();status='sensor-error';error=$_.Exception.Message;sampledAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}|ConvertTo-Json -Compress -Depth 4)
  if($OutputFile){try{[IO.File]::WriteAllText($OutputFile,$json,[Text.UTF8Encoding]::new($false))}catch{}}else{[Console]::WriteLine($json)}
}finally{if($computer){try{$computer.Close()}catch{}};if($script:zen){try{$script:zen.Dispose()}catch{}}}
