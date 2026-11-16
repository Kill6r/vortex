# SPDX-License-Identifier: GPL-3.0-or-later
# Independent SMU helper using ZenStates-Core 1.91. Source is supplied alongside the library.
$script:zen=$null
$script:undoState=$null
$script:undoFingerprint=$null
$script:lastReply=$null
$script:powerCeilings=$null

# Exact PM table sizes from ZenStates-Core v1.91. Only 0x620105 has
# a verified PBO limit map in VORTEX, independently corroborated on 9800X3D.
$script:vermeerTables=@{
  0x380005=0x1BB0;0x380505=0xF30;0x380605=0xC10;0x380705=0x8F0
  0x380804=0x8A4;0x380805=0x8F0;0x380904=0x5A4;0x380905=0x5D0
}
$script:raphaelTables=@{
  0x540100=0x618;0x540101=0x61C;0x540102=0x66C;0x540103=0x68C;0x540104=0x6A8;0x540105=0x6B4;0x540108=0x6BC
  0x540000=0x828;0x540001=0x82C;0x540002=0x87C;0x540003=0x89C;0x540004=0x8BC;0x540005=0x8C8;0x540208=0x8D0
}
$script:graniteTables=@{0x620105=0x724;0x621102=0x724;0x621202=0x994;0x620205=0x994}

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
  $values=@();$mapping=@();$dies=@()
  $topology=$script:zen.info.topology
  if($topology.ccds -notin @(1,2) -or $topology.coreDisableMap.Count -ne $topology.ccds -or
     ($topology.ccds -eq 1 -and $topology.ccdEnableMap -ne 1) -or
     ($topology.ccds -eq 2 -and $topology.ccdEnableMap -ne 3)){throw 'No se pudo verificar el mapa de CCD del procesador.'}
  for($ccd=0;$ccd -lt $topology.ccds;$ccd++){
    for($i=0;$i -lt 8;$i++){
      if(($topology.coreDisableMap[$ccd] -band (1 -shl $i)) -eq 0){$mapping+=$i;$dies+=$ccd}
    }
  }
  if($mapping.Count -eq 0 -or $mapping.Count -ne $topology.cores){throw 'No se pudo verificar el mapa de núcleos habilitados.'}
  for($i=0;$i -lt $mapping.Count;$i++){
    $raw=$script:zen.GetPsmMarginSingleCore([uint32]$mapping[$i],[uint32]$dies[$i],[uint32]0)
    if($null -eq $raw){throw 'El firmware no permite leer Curve Optimizer.'}
    $value=[int]($raw -band 0xffff);if($value -ge 32768){$value-=65536}
    if($value -lt -50 -or $value -gt 50){throw 'El firmware devolvió una curva fuera del rango reconocido.'}
    $values+=$value
  }
  return @{values=$values;mapping=$mapping;dies=$dies}
}
function Get-StateFingerprint($state){return (@($state.limits.ppt,$state.limits.tdc,$state.limits.edc,$state.scalar,$state.fmaxMHz)+@($state.curveOptimizer)) -join ':'}
function Read-Smu {
  Initialize-Smu
  $cpu=$script:zen
  $vermeer=[int]$cpu.info.family -eq 25 -and [int]$cpu.info.model -eq 0x21 -and [string]$cpu.info.codeName -eq 'Vermeer' -and $cpu.info.cpuName -match '\bRyzen\s+[3579]\s+5\d{3}(?:XT|X3D|X)?\b'
  $raphael=[int]$cpu.info.family -eq 25 -and [string]$cpu.info.codeName -eq 'Raphael' -and $cpu.info.cpuName -match '\bRyzen\s+[579]\s+7\d{3}(?:X3D|X|F)?\b'
  $granite=[int]$cpu.info.family -eq 26 -and [int]$cpu.info.model -eq 68 -and [string]$cpu.info.codeName -eq 'GraniteRidge' -and $cpu.info.cpuName -match '\bRyzen\s+[579]\s+9\d{3}(?:X3D|X|F)?\b'
  if(-not ($vermeer -or $raphael -or $granite)){throw 'Este procesador conserva el monitoreo general de CPU.'}
  if([string]$cpu.RefreshPowerTable() -ne 'OK'){throw 'No se pudo actualizar la tabla de telemetría SMU.'}
  # The library maps 1828 bytes; firmware can return a larger 2452-byte buffer.
  # Only the verified mapped prefix is used, never fields from the extra buffer.
  $version=[int]$cpu.smu.TableVersion
  $tables=if($vermeer){$script:vermeerTables}elseif($raphael){$script:raphaelTables}else{$script:graniteTables}
  if(-not $tables.ContainsKey($version) -or $cpu.powerTable.TableSize -ne $tables[$version] -or
     $cpu.powerTable.Table.Length -lt ($tables[$version]/4) -or
     ($version -eq 0x620105 -and $cpu.powerTable.Table.Length -notin @(457,613))){
    throw ('Tabla SMU sin mapa verificado: 0x{0:X8}. Siguen disponibles los sensores generales.' -f $version)
  }
  $table=$cpu.powerTable.Table
  $voltage=[double]$cpu.powerTable.VDDCR_SOC_VOLTAGE;$current=[double]$cpu.powerTable.VDDCR_SOC_CURRENT
  $info=@{supported=$false;readOnly=$true;cpu=$cpu.info.cpuName;coreCount=[int]$cpu.info.topology.cores;
    tableVersion=('0x{0:X8}' -f $version);error='El firmware permite leer sensores SMU. Los ajustes se habilitan en modelos y tablas verificados.'}
  $telemetry=@{tuning=$info;cpuVoltageV=[double]$cpu.powerTable.VDDCR_VDD_VOLTAGE;socVoltageV=$voltage;
    socPowerW=($voltage*$current);fabricClockMHz=[double]$cpu.powerTable.FCLK}
  try{$fmax=[int]$cpu.GetFMax()}catch{$fmax=0}
  if($fmax -ge 4000 -and $fmax -le 6500){$info.fmaxMHz=$fmax}
  if($vermeer){
    $info.error='Ryzen 5000 Vermeer en modo de monitoreo. Este firmware no está habilitado para aplicar ajustes desde VORTEX.'
    # Zen3 exposes this via its discrete PM-table fields rather than SVI3.
    $telemetry=@{tuning=$info;socVoltageV=[double]$cpu.powerTable.VDDCR_SOC;fabricClockMHz=[double]$cpu.powerTable.FCLK}
    # Confirmed on the 5600X 0x380905 table against RAPL package accounting (GNR-SMU Vermeer map).
    if($cpu.info.cpuName -match '\b5600X\b' -and $version -eq 0x380905 -and $table.Length -eq 372){
      $telemetry.packagePowerW=[double]$table[1]
    }
    return $telemetry
  }
  try{$curve=Get-CurveState;$info.curveOptimizer=$curve.values}catch{$curve=$null}
  if(-not $granite -or $version -ne 0x620105){return $telemetry}
  $limits=@{ppt=[int][Math]::Round($table[2]);tdc=[int][Math]::Round($table[8]);edc=[int][Math]::Round($table[63])}
  if($limits.ppt -lt 1 -or $limits.ppt -gt 300 -or $limits.tdc -lt 1 -or $limits.tdc -gt 300 -or $limits.edc -lt 1 -or $limits.edc -gt 500){throw 'Los límites leídos no son coherentes con el mapa de la tabla SMU.'}
  $info.limits=$limits
  $telemetry.pptW=[double]$table[3];$telemetry.tdcA=[double]$table[9];$telemetry.thermalLimitC=[double]$table[10]
  $telemetry.pptLimitW=$limits.ppt;$telemetry.tdcLimitA=$limits.tdc;$telemetry.edcLimitA=$limits.edc
  $is9600=$cpu.info.cpuName -match '\b9600X\b' -and $curve.mapping.Count -eq 6
  $is9800=$cpu.info.cpuName -match '\b9800X3D\b' -and $curve.mapping.Count -eq 8
  if(-not ($is9600 -or $is9800) -or $cpu.info.topology.ccds -ne 1){return $telemetry}
  $state=$info
  $state.scalar=[int][Math]::Round($cpu.GetPBOScalar())
  if($state.scalar -lt 1 -or $state.scalar -gt 10 -or -not $info.ContainsKey('fmaxMHz')){return $telemetry}
  $state.physicalCoreIds=$curve.mapping
  $state.boostAdjustable=$is9600
  if($is9800){
    if($limits.ppt -lt 10 -or $limits.ppt -gt 200 -or $limits.tdc -gt 150 -or $limits.edc -gt 200 -or $limits.tdc -gt $limits.edc -or
       $curve.values.Where({$_ -lt -30 -or $_ -gt 10}).Count -gt 0 -or $state.fmaxMHz -gt 5800){return $telemetry}
    if(-not $script:powerCeilings){$script:powerCeilings=$limits.Clone()}
    $state.powerCeilings=$script:powerCeilings
  }
  $state.fingerprint=Get-StateFingerprint $state
  $state.supported=$true;$state.readOnly=$false;$state.Remove('error')
  $state.canUndo=($null -ne $script:undoState -and $state.fingerprint -eq $script:undoFingerprint)
  return $telemetry
}
function Assert-Integer($value,$minimum,$maximum,$label){
  if($null -eq $value -or $value -is [string] -or $value -is [bool] -or [double]::IsNaN([double]$value) -or [double]$value -ne [Math]::Truncate([double]$value) -or [double]$value -lt $minimum -or [double]$value -gt $maximum){throw "$label fuera del rango permitido ($minimum a $maximum)."}
}
function Validate-Target($target,$before){
  Assert-Integer $target.limits.ppt 10 200 'PPT';Assert-Integer $target.limits.tdc 1 150 'TDC';Assert-Integer $target.limits.edc 1 200 'EDC'
  if($target.limits.tdc -gt $target.limits.edc){throw 'TDC no puede superar EDC.'}
  Assert-Integer $target.scalar 1 10 'Scalar';Assert-Integer $target.fmaxMHz 4000 5800 'FMax'
  $coreCount=if($before){$before.physicalCoreIds.Count}else{6}
  if($target.curveOptimizer.Count -ne $coreCount){throw "Se requieren $coreCount valores de Curve Optimizer."}
  foreach($value in $target.curveOptimizer){Assert-Integer $value -30 10 'Curve Optimizer'}
  if($before.powerCeilings){
    foreach($key in @('ppt','tdc','edc')){
      if($target.limits.$key -gt $before.powerCeilings.$key){throw "$key supera el límite inicial del procesador."}
    }
    if($target.fmaxMHz -ne $before.fmaxMHz -or $target.scalar -ne $before.scalar){throw 'En este procesador, boost y Scalar se conservan.'}
  }
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
  for($i=0;$i -lt $target.curveOptimizer.Count;$i++){
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
  for($i=0;$i -lt $before.physicalCoreIds.Count;$i++){
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
    if($before.readOnly){throw 'Este firmware está en modo de solo lectura.'}
    if($request.expectedFingerprint -ne $before.fingerprint){throw 'La configuración del procesador cambió. Actualiza los valores antes de aplicar.'}
    if($request.action -in @('apply','trial')){$target=$request.target;Validate-Target $target $before}
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
