import { ImageResponse } from 'next/og';
export const alt = 'Devils Advocate — Better questions for business ideas and personal decisions';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(<div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',padding:90,background:'#f5f5f7',color:'#1d1d1f',fontFamily:'sans-serif' }}><div style={{fontSize:28,color:'#0071e3',marginBottom:44}}>Devils Advocate</div><div style={{display:'flex',flexDirection:'column',fontSize:72,fontWeight:700,letterSpacing:-3,lineHeight:1.1}}><span>Good ideas deserve</span><span>better questions.</span></div><div style={{fontSize:28,color:'#64646b',marginTop:40}}>Business validation · Philosophical reflection</div><div style={{fontSize:22,color:'#64646b',marginTop:24}}>Your call. Always.</div></div>, size);
}
