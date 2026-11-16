export const NATIVE_LIMITS = Object.freeze({ppt:200,tdc:150,edc:200});
export function nativeTuningTarget(input, hardware = null) {
  if(!input || typeof input!=='object')throw new Error('Configuración no válida.');
  const integer=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label}: introduce un entero de ${min} a ${max}.`);return value;};
  const limit = key => hardware?.powerCeilings?.[key] ?? NATIVE_LIMITS[key];
  const limits={ppt:integer(input.limits?.ppt,10,limit('ppt'),'PPT'),tdc:integer(input.limits?.tdc,1,limit('tdc'),'TDC'),edc:integer(input.limits?.edc,1,limit('edc'),'EDC')};
  if(limits.tdc>limits.edc)throw new Error('TDC no puede superar EDC.');
  const coreCount = hardware?.coreCount ?? 6;
  if(![6,8].includes(coreCount) || !Array.isArray(input.curveOptimizer) || input.curveOptimizer.length !== coreCount) {
    throw new Error(`Se requieren ${coreCount} valores de Curve Optimizer para este procesador.`);
  }
  const scalar = integer(input.scalar,1,10,'Scalar');
  const fmaxMHz = integer(input.fmaxMHz,4000,5800,'FMax');
  if (hardware?.boostAdjustable === false && (fmaxMHz !== hardware.fmaxMHz || scalar !== hardware.scalar)) {
    throw new Error('En este procesador, boost y Scalar se conservan.');
  }
  return {limits,scalar,fmaxMHz,curveOptimizer:input.curveOptimizer.map(v=>integer(v,-30,10,'Curve Optimizer'))};
}
