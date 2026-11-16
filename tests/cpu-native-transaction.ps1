param([string]$Helper=(Join-Path $PSScriptRoot '../src/main/cpu-monitor/smu.ps1'))
$ErrorActionPreference='Stop'
. $Helper
# This test never loads a hardware library. Every firmware call targets this fake.
class FakeCpu {
  [hashtable]$State
  [hashtable]$info
  [bool]$FailEdc=$false
  [int[]]$WrittenCores=@()
  FakeCpu([hashtable]$state){$this.State=$state;$this.info=@{topology=@{ccds=1;cores=6;coreDisableMap=@(3)}}}
  [string] SetPPTLimit([uint32]$value){$this.State.limits.ppt=[int]$value;return 'OK'}
  [string] SetTDCVDDLimit([uint32]$value){$this.State.limits.tdc=[int]$value;return 'OK'}
  [string] SetEDCVDDLimit([uint32]$value){if($this.FailEdc){$this.FailEdc=$false;return 'FAILED'};$this.State.limits.edc=[int]$value;return 'OK'}
  [string] SetPBOScalar([uint32]$value){$this.State.scalar=[int]$value;return 'OK'}
  [uint32]$MaxFMax=5800
  [bool] SetFMax([uint32]$value){$this.State.fmaxMHz=[Math]::Min($value,$this.MaxFMax);return $true}
  [uint32] GetPsmMarginSingleCore([uint32]$core,[uint32]$ccd,[uint32]$ccx){$value=$this.State.curveOptimizer[$core-2];if($value -lt 0){$value+=65536};return [uint32]$value}
  [bool] SetPsmMarginSingleCore([uint32]$core,[uint32]$ccd,[uint32]$ccx,[int]$value){if($core -lt 2 -or $core -gt 7){throw 'Disabled physical core targeted'};$this.WrittenCores+=[int]$core;$this.State.curveOptimizer[$core-2]=$value;return $true}
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
