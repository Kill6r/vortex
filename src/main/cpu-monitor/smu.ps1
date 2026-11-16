# SPDX-License-Identifier: GPL-3.0-or-later
# Independent SMU helper using ZenStates-Core 1.91. Source is supplied alongside the library.
$script:zen=$null
$script:undoState=$null
$script:undoFingerprint=$null
$script:lastReply=$null

function Initialize-Smu {
  if($script:zen){return}
  $null=[Reflection.Assembly]::LoadFrom((Join-Path $PSScriptRoot 'ZenStates-Core.dll'))
  $options=[ZenStates.Core.CoreOptions]::new()
  foreach($key in @('IoModule','Timings','Aod','Wmi','Sensors')){
    $module=[ZenStates.Core.CoreOptions+ModuleSettings]::new();$module.Enabled=$false;$module.Autorefresh=$false;$options.$key=$module
  }
  $script:zen=[ZenStates.Core.Cpu]::new($options)
}
function Get-CurveState {
  $values=@();$mapping=@()
  $topology=$script:zen.info.topology
  if([int]$topology.ccds -ne 1 -or [int]$topology.cores -ne 6 -or $topology.coreDisableMap.Count -ne 1){throw 'La topología del procesador no coincide con la configuración validada.'}
  for($i=0;$i -lt 8;$i++){
    if(($topology.coreDisableMap[0] -band (1 -shl $i)) -eq 0){
      $raw=$script:zen.GetPsmMarginSingleCore([uint32]$i,[uint32]0,[uint32]0)
      if($null -eq $raw){throw 'El firmware no permite leer Curve Optimizer.'}
      $value=[int]($raw -band 0xffff);if($value -ge 32768){$value-=65536}
      if($value -lt -50 -or $value -gt 50){throw 'El firmware devolvió una curva fuera del rango reconocido.'}
      $values+=$value;$mapping+=$i
    }
  }
  if($values.Count -ne 6){throw 'No se pudo verificar el mapa de los seis núcleos habilitados.'}
  return @{values=$values;mapping=$mapping}
}
function Get-StateFingerprint($state){return (@($state.limits.ppt,$state.limits.tdc,$state.limits.edc,$state.scalar,$state.fmaxMHz)+@($state.curveOptimizer)) -join ':'}
function Read-Smu {
  Initialize-Smu
  $cpu=$script:zen
  if([int]$cpu.info.family -ne 26 -or [int]$cpu.info.model -ne 68 -or [string]$cpu.info.codeName -ne 'GraniteRidge' -or $cpu.info.cpuName -notmatch '\b9600X\b'){throw 'El tuning directo de esta versión está validado para Ryzen 5 9600X (Granite Ridge).'}
  if([string]$cpu.RefreshPowerTable() -ne 'OK'){throw 'No se pudo actualizar la tabla de telemetría SMU.'}
  # The library maps 1828 bytes; firmware can return a larger 2452-byte buffer.
  # Only the verified mapped prefix is used, never fields from the extra buffer.
  if($cpu.smu.TableVersion -ne 0x620105 -or $cpu.powerTable.TableSize -ne 1828 -or $cpu.powerTable.Table.Length -notin @(457,613)){throw "Tabla SMU no compatible: versión $($cpu.smu.TableVersion), tamaño $($cpu.powerTable.TableSize), campos $($cpu.powerTable.Table.Length)."}
  $table=$cpu.powerTable.Table
  $limits=@{ppt=[int][Math]::Round($table[2]);tdc=[int][Math]::Round($table[8]);edc=[int][Math]::Round($table[63])}
  if($limits.ppt -lt 1 -or $limits.ppt -gt 300 -or $limits.tdc -lt 1 -or $limits.tdc -gt 300 -or $limits.edc -lt 1 -or $limits.edc -gt 500){throw 'Los límites leídos no son coherentes con el mapa de la tabla SMU.'}
  $curve=Get-CurveState
  $state=@{limits=$limits;scalar=[int][Math]::Round($cpu.GetPBOScalar());fmaxMHz=[int]$cpu.GetFMax();curveOptimizer=$curve.values;physicalCoreIds=$curve.mapping;cpu=$cpu.info.cpuName;coreCount=6}
  if($state.scalar -lt 1 -or $state.scalar -gt 10 -or $state.fmaxMHz -lt 4000 -or $state.fmaxMHz -gt 6500){throw 'No se pudieron verificar los parámetros de boost actuales.'}
  $state.fingerprint=Get-StateFingerprint $state
  $state.supported=$true;$state.canUndo=($null -ne $script:undoState -and $state.fingerprint -eq $script:undoFingerprint)
  $state.tableVersion='0x00620105'
  $voltage=[double]$cpu.powerTable.VDDCR_SOC_VOLTAGE;$current=[double]$cpu.powerTable.VDDCR_SOC_CURRENT
  return @{tuning=$state;pptW=[double]$table[3];tdcA=[double]$table[9];pptLimitW=$limits.ppt;tdcLimitA=$limits.tdc;edcLimitA=$limits.edc;cpuVoltageV=[double]$cpu.powerTable.VDDCR_VDD_VOLTAGE;socVoltageV=$voltage;socPowerW=($voltage*$current);fabricClockMHz=[double]$cpu.powerTable.FCLK;thermalLimitC=[double]$table[10]}
}
function Assert-Integer($value,$minimum,$maximum,$label){
  if($null -eq $value -or $value -is [string] -or $value -is [bool] -or [double]::IsNaN([double]$value) -or [double]$value -ne [Math]::Truncate([double]$value) -or [double]$value -lt $minimum -or [double]$value -gt $maximum){throw "$label fuera del rango permitido ($minimum a $maximum)."}
}
function Validate-Target($target){
  Assert-Integer $target.limits.ppt 10 200 'PPT';Assert-Integer $target.limits.tdc 1 150 'TDC';Assert-Integer $target.limits.edc 1 200 'EDC'
  if($target.limits.tdc -gt $target.limits.edc){throw 'TDC no puede superar EDC.'}
  Assert-Integer $target.scalar 1 10 'Scalar';Assert-Integer $target.fmaxMHz 4000 5800 'FMax'
  if($target.curveOptimizer.Count -ne 6){throw 'Se requieren seis valores de Curve Optimizer.'}
  foreach($value in $target.curveOptimizer){Assert-Integer $value -30 10 'Curve Optimizer'}
}
function Compare-SmuReadback($target,$actual){
  foreach($key in @('ppt','tdc','edc')){
    if($target.limits.$key -ne $actual.limits.$key){
      $unit=if($key -eq 'ppt'){'W'}else{'A'}
      '{0} ({1} → {2} {3})' -f $key.ToUpperInvariant(),$target.limits.$key,$actual.limits.$key,$unit
    }
  }
  if($target.fmaxMHz -ne $actual.fmaxMHz){'Boost ({0} → {1} MHz)' -f $target.fmaxMHz,$actual.fmaxMHz}
  if($target.scalar -ne $actual.scalar){'PBO Scalar ({0} → {1})' -f $target.scalar,$actual.scalar}
  for($i=0;$i -lt 6;$i++){
    if($target.curveOptimizer[$i] -ne $actual.curveOptimizer[$i]){
      'CO núcleo {0} ({1} → {2})' -f $i,$target.curveOptimizer[$i],$actual.curveOptimizer[$i]
    }
  }
}

function Confirm-SmuReadback($target){
  $expected=Get-StateFingerprint $target
  $after=$null
  $readError=$null
  # Read again without repeating writes while the firmware publishes the new state.
  foreach($delay in @(100,250,400,550,700)){
    Start-Sleep -Milliseconds $delay
    try{$after=(Read-Smu).tuning}catch{$readError=$_.Exception.Message;continue}
    if($after.fingerprint -eq $expected){return $after}
  }
  if(-not $after){throw "No se pudo verificar la lectura posterior del firmware. $readError"}
  $differences=@(Compare-SmuReadback $target $after)
  if($differences.Count){throw "La lectura posterior difiere (solicitado → leído): $($differences -join '; ')."}
  throw 'La lectura posterior no coincide con los valores solicitados.'
}

function Set-VerifiedState($target,$before){
  $cpu=$script:zen;$changed=@()
  foreach($key in @('ppt','tdc','edc')){
    if($target.limits.$key -ne $before.limits.$key){
      $value=[uint32]$target.limits.$key
      $result=switch($key){'ppt'{$cpu.SetPPTLimit($value)}'tdc'{$cpu.SetTDCVDDLimit($value)}'edc'{$cpu.SetEDCVDDLimit($value)}}
      if([string]$result -ne 'OK'){throw "El firmware rechazó $key ($result)."};$changed+=$key
    }
  }
  if($target.scalar -ne $before.scalar){if([string]$cpu.SetPBOScalar([uint32]$target.scalar) -ne 'OK'){throw 'El firmware rechazó PBO Scalar.'};$changed+='scalar'}
  if($target.fmaxMHz -ne $before.fmaxMHz){if(-not $cpu.SetFMax([uint32]$target.fmaxMHz)){throw 'El firmware rechazó FMax.'};$changed+='fmaxMHz'}
  for($i=0;$i -lt 6;$i++){
    if($target.curveOptimizer[$i] -ne $before.curveOptimizer[$i]){
      if(-not $cpu.SetPsmMarginSingleCore([uint32]$before.physicalCoreIds[$i],[uint32]0,[uint32]0,[int]$target.curveOptimizer[$i])){throw "El firmware rechazó Curve Optimizer en el núcleo $i."};$changed+="core$i"
    }
  }
  $after=Confirm-SmuReadback $target
  return @{after=$after;changed=$changed}
}
function Process-SmuRequest([string]$output){
  if(-not $output){return}
  $requestFile=$output+'.request.json';if(-not (Test-Path -LiteralPath $requestFile)){return}
  $request=Get-Content -LiteralPath $requestFile -Raw|ConvertFrom-Json
  if(-not $request.id -or $request.id -eq $script:lastReply.id){return}
  $reply=@{id=[string]$request.id;ok=$false}
  try{
    $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if($request.expiresAt -le $now -or $request.expiresAt -gt ($now+60000)){throw 'La solicitud expiró. Vuelve a comprobar los valores actuales.'}
    $before=(Read-Smu).tuning
    if($request.expectedFingerprint -ne $before.fingerprint){throw 'La configuración del procesador cambió. Actualiza los valores antes de aplicar.'}
    if($request.action -in @('apply','trial')){$target=$request.target;Validate-Target $target}
    elseif($request.action -eq 'undo' -and $script:undoState -and $before.fingerprint -eq $script:undoFingerprint){$target=$script:undoState}
    else{throw 'Acción no permitida o copia anterior ya no vigente.'}
    try{$applied=Set-VerifiedState $target $before}
    catch{
      $cause=$_.Exception.Message
      try{$current=(Read-Smu).tuning;$null=Set-VerifiedState $before $current;$reply.restored=$true}catch{$reply.restored=$false}
      if($reply.restored){throw "$cause Se restauró y verificó la configuración anterior."}
      throw "$cause No se pudo verificar la restauración de la configuración anterior."
    }
    if($request.action -eq 'apply' -and $applied.changed.Count -gt 0){$script:undoState=$before;$script:undoFingerprint=$applied.after.fingerprint}
    elseif($request.action -eq 'undo'){$script:undoState=$null;$script:undoFingerprint=$null}
    $applied.after.canUndo=($null -ne $script:undoState -and $applied.after.fingerprint -eq $script:undoFingerprint)
    $reply.ok=$true;$reply.before=$before;$reply.after=$applied.after;$reply.changed=$applied.changed
  }catch{$reply.error=$_.Exception.Message}
  $script:lastReply=$reply
  $temp=$output+'.reply.tmp';$dest=$output+'.reply.json'
  [IO.File]::WriteAllText($temp,($reply|ConvertTo-Json -Compress -Depth 8),[Text.UTF8Encoding]::new($false))
  if(Test-Path -LiteralPath $dest){[IO.File]::Replace($temp,$dest,($dest+'.bak'))}else{[IO.File]::Move($temp,$dest)}
}
