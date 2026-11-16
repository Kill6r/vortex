export const NATIVE_LIMITS = Object.freeze({ppt:200,tdc:150,edc:200});
export function nativeTuningTarget(input) {
  if(!input || typeof input!=='object')throw new Error('Configuración no válida.');
  const integer=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label}: introduce un entero de ${min} a ${max}.`);return value;};
  const limits={ppt:integer(input.limits?.ppt,10,200,'PPT'),tdc:integer(input.limits?.tdc,1,150,'TDC'),edc:integer(input.limits?.edc,1,200,'EDC')};
  if(limits.tdc>limits.edc)throw new Error('TDC no puede superar EDC.');
  if(!Array.isArray(input.curveOptimizer)||input.curveOptimizer.length!==6)throw new Error('Se requieren seis valores de Curve Optimizer.');
  return {limits,scalar:integer(input.scalar,1,10,'Scalar'),fmaxMHz:integer(input.fmaxMHz,4000,5800,'FMax'),curveOptimizer:input.curveOptimizer.map(v=>integer(v,-30,10,'Curve Optimizer'))};
}
