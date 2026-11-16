param([string]$Helper=(Join-Path $PSScriptRoot '../src/main/cpu-monitor/smu.ps1'))
$ErrorActionPreference='Stop'
. $Helper
$readNative = ${function:Read-Smu}
# This test never loads a hardware library. Every firmware call targets this fake.
class FakeCpu {
  [hashtable]$State
  [hashtable]$info
  [hashtable]$smu
  [hashtable]$powerTable
  [bool]$FailEdc=$false
  [int[]]$WrittenCores=@()
  FakeCpu([hashtable]$state){$this.State=$state;$this.info=@{topology=@{ccds=1;cores=6;ccdEnableMap=1;coreDisableMap=@(3)}}}
  [string] RefreshPowerTable(){return 'OK'}
  [int] GetFMax(){return $this.State.fmaxMHz}
  [int] GetPBOScalar(){return $this.State.scalar}
  [string] SetPPTLimit([uint32]$value){$this.State.limits.ppt=[int]$value;return 'OK'}
  [string] SetTDCVDDLimit([uint32]$value){$this.State.limits.tdc=[int]$value;return 'OK'}
  [string] SetEDCVDDLimit([uint32]$value){if($this.FailEdc){$this.FailEdc=$false;return 'FAILED'};$this.State.limits.edc=[int]$value;return 'OK'}
  [string] SetPBOScalar([uint32]$value){$this.State.scalar=[int]$value;return 'OK'}
  [uint32]$MaxFMax=5800
  [bool] SetFMax([uint32]$value){$this.State.fmaxMHz=[Math]::Min($value,$this.MaxFMax);return $true}
  [uint32] GetPsmMarginSingleCore([uint32]$core,[uint32]$ccd,[uint32]$ccx){$slot=@($this.State.physicalCoreIds).IndexOf([int]$core);if($slot -lt 0 -or $ccd -ne 0){throw 'Disabled physical core targeted'};$value=$this.State.curveOptimizer[$slot];if($value -lt 0){$value+=65536};return [uint32]$value}
  [bool] SetPsmMarginSingleCore([uint32]$core,[uint32]$ccd,[uint32]$ccx,[int]$value){$slot=@($this.State.physicalCoreIds).IndexOf([int]$core);if($slot -lt 0 -or $ccd -ne 0){throw 'Disabled physical core targeted'};$this.WrittenCores+=[int]$core;$this.State.curveOptimizer[$slot]=$value;return $true}
}
function New-State {return @{limits=@{ppt=95;tdc=60;edc=90};scalar=1;fmaxMHz=5625;curveOptimizer=@(0,0,0,0,0,0);physicalCoreIds=@(2,3,4,5,6,7)}}
function Copy-State($state){return @{limits=@{ppt=$state.limits.ppt;tdc=$state.limits.tdc;edc=$state.limits.edc};scalar=$state.scalar;fmaxMHz=$state.fmaxMHz;curveOptimizer=@($state.curveOptimizer);physicalCoreIds=@($state.physicalCoreIds)}}
function Read-Smu {
  $state=Copy-State $script:zen.State
  $state.fingerprint=Get-StateFingerprint $state
  if($script:badRead){$script:badRead=$false;$state.fingerprint='wrong-readback'}
  return @{tuning=$state}
}
function Assert($ok,$message){if(-not $ok){throw $message}}
function Request($action,$target,$fingerprint,$expiresAt=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+45000)){
  $request=@{id=[guid]::NewGuid().ToString();action=$action;target=$target;expectedFingerprint=$fingerprint;expiresAt=$expiresAt}
  $request|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($script:output+'.request.json') -Encoding UTF8
  Process-SmuRequest $script:output
  return $script:lastReply
}
$script:zen=[FakeCpu]::new((New-State))
$script:output=Join-Path ([IO.Path]::GetTempPath()) ('vortex-fake-smu-'+[guid]::NewGuid().ToString())
$initial=(Read-Smu).tuning
$target=Copy-State $initial;$target.limits.ppt=85;$target.limits.tdc=55;$target.limits.edc=85;$target.scalar=2;$target.fmaxMHz=5500;$target.curveOptimizer=@(-30,-15,0,5,10,-5)
Validate-Target $target
$reply=Request 'apply' $target $initial.fingerprint
Assert $reply.ok 'Apply failed';Assert $reply.after.canUndo 'Undo unavailable after apply'
Assert (($script:zen.WrittenCores -join ',') -eq '2,3,5,6,7') 'Physical cores mapping wrong'
Assert (((Get-CurveState).values -join ',') -eq '-30,-15,0,5,10,-5') 'Signed curve decoding wrong'
$reply=Request 'undo' $null $reply.after.fingerprint
Assert $reply.ok 'Undo failed';Assert ((Get-StateFingerprint $script:zen.State) -eq $initial.fingerprint) 'Undo did not restore original'
$reply=Request 'apply' $target 'stale-fingerprint';Assert (-not $reply.ok) 'Stale request accepted'
$reply=Request 'apply' $target $initial.fingerprint 1;Assert (-not $reply.ok) 'Expired request accepted'
$invalid=Copy-State $target;$invalid.curveOptimizer[1]=11
$reply=Request 'apply' $invalid $initial.fingerprint;Assert (-not $reply.ok) 'Invalid positive margin accepted'
$script:zen.FailEdc=$true
$reply=Request 'apply' $target $initial.fingerprint
Assert (-not $reply.ok) 'Rejected firmware write accepted';Assert $reply.restored 'Partial write not rolled back'
Assert ((Get-StateFingerprint $script:zen.State) -eq $initial.fingerprint) 'Partial write changed state'
$script:badRead=$true
$settled=Set-VerifiedState $initial $initial
Assert ($settled.after.fingerprint -eq $initial.fingerprint) 'Readback did not retry the transient mismatch'
$script:zen.MaxFMax=5650
$clamped=Copy-State $initial
$clamped.fmaxMHz=5800
$clamped.curveOptimizer=@(-30,-30,-30,-30,-30,-30)
$reply=Request 'apply' $clamped $initial.fingerprint
Assert (-not $reply.ok) 'Persistent firmware clamp was accepted'
Assert ($reply.error -match 'Boost \(5800 .* 5650 MHz\)') 'Missing requested and measured boost in readback error'
Assert $reply.restored 'Original values were not restored after the clamp'
Assert ((Get-StateFingerprint $script:zen.State) -eq $initial.fingerprint) 'Partial application was not reversed'
$reply=Request 'unexpected' $target $initial.fingerprint;Assert (-not $reply.ok) 'Unknown action accepted'
Write-Output 'PASS: fake SMU apply, signed core mapping, undo, stale/expired/invalid rejection, partial rollback, readback mismatch.'

# Known 9800X3D PM table and its 8 enabled physical cores.
$eight=New-State
$eight.curveOptimizer=@(0,0,0,0,0,0,0,0);$eight.physicalCoreIds=@(0,1,2,3,4,5,6,7)
$eight.fmaxMHz=5250
$script:zen=[FakeCpu]::new($eight)
$script:zen.info=@{cpuName='AMD Ryzen 7 9800X3D 8-Core Processor';family=26;model=68;codeName='GraniteRidge';topology=@{ccds=1;cores=8;ccdEnableMap=1;coreDisableMap=@(0)}}
$script:zen.smu=@{TableVersion=0x620105}
$table=New-Object 'float[]' 457
$table[2]=95;$table[3]=60;$table[8]=60;$table[9]=30;$table[10]=95;$table[63]=90
$script:zen.powerTable=@{Table=$table;TableSize=1828;FCLK=2000;VDDCR_SOC_VOLTAGE=1.21;VDDCR_SOC_CURRENT=10;VDDCR_VDD_VOLTAGE=1.16}
$sample=& $readNative
Assert $sample.tuning.supported '9800X3D recognized firmware not enabled'
Assert (-not $sample.tuning.boostAdjustable) '9800X3D boosted by the wrong model settings'
Assert ($sample.tuning.physicalCoreIds.Count -eq 8) 'Wrong 9800X3D CPU topology'
$newTarget=Copy-State $eight
$newTarget.curveOptimizer[7]=-5
Validate-Target $newTarget $sample.tuning
$applied=Set-VerifiedState $newTarget $sample.tuning
Assert ($applied.changed[0] -eq 'core7') 'The eighth core was not applied'
$newTarget.limits.ppt=96
$accepted=$true
try { Validate-Target $newTarget $sample.tuning } catch { $accepted=$false }
Assert (-not $accepted) '9800X3D accepted a PPT increase past the initial limit'

# A different geometry or table may be monitored without permitting writes.
$script:zen.info=@{cpuName='AMD Ryzen 7 7700X 8-Core Processor';family=25;model=97;codeName='Raphael';topology=@{ccds=1;cores=8;ccdEnableMap=1;coreDisableMap=@(0)}}
$script:zen.smu.TableVersion=0x540104
$script:zen.powerTable.Table=New-Object 'float[]' 426
$script:zen.powerTable.TableSize=0x6A8
$sample=& $readNative
Assert ($sample.tuning.readOnly -and -not $sample.tuning.supported) 'Raphael must stay read-only'
Assert ($sample.tuning.fmaxMHz -eq 5250 -and $sample.tuning.curveOptimizer.Count -eq 8) 'Raphael telemetry missing'
Assert (-not $sample.ContainsKey('edcLimitA')) 'Raphael must not reuse Granite Ridge limits'
Write-Output 'PASS: Ryzen 9800X3D read/write fixture, 8 cores, conservative limits, and Ryzen 7000 read-only fixture.'

$script:zen.info=@{cpuName='AMD Ryzen 5 5600X 6-Core Processor';family=25;model=0x21;codeName='Vermeer';topology=@{cores=6}}
$script:zen.State.fmaxMHz=4650
$script:zen.smu.TableVersion=0x380905
$script:zen.powerTable.Table=New-Object 'float[]' 372
$script:zen.powerTable.Table[1]=51
$script:zen.powerTable.TableSize=0x5D0
$script:zen.powerTable.FCLK=1800
$script:zen.powerTable.VDDCR_SOC=1.1
$sample=& $readNative
Assert ($sample.tuning.readOnly -and -not $sample.tuning.supported) 'Vermeer must stay read-only'
Assert ($sample.tuning.fmaxMHz -eq 4650 -and $sample.fabricClockMHz -eq 1800 -and $sample.packagePowerW -eq 51) 'Vermeer telemetry missing'
Assert (-not $sample.tuning.ContainsKey('curveOptimizer') -and -not $sample.ContainsKey('edcLimitA')) 'Vermeer must not reuse other models curve and limits'
$script:zen.info.cpuName='AMD Ryzen 9 5900X 12-Core Processor'
$sample=& $readNative
Assert (-not $sample.ContainsKey('packagePowerW')) '5600X package power mapping reused on another SKU'
Write-Output 'PASS: Vermeer telemetry recognizes the table and only uses the confirmed 5600X power field on that SKU.'
