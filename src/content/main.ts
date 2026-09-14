import { detectContext, extractAll } from '../adapter/pipeline';
import { installPageState, type PageWindow } from '../adapter/page-state';
import { safeError } from '../shared/errors';

const state=installPageState(window as PageWindow);
let active=false;
state.request=async(type:string)=>{
  if(type!=='PAGE_CONTEXT_REQUEST'&&type!=='EXTRACT_CANDIDATE_REQUEST')return {success:false,error:{code:'INVALID_SCHEMA'}};
  if(type==='EXTRACT_CANDIDATE_REQUEST'&&active)return {success:false,error:{code:'PAGE_NOT_READY'}};
  if(type==='EXTRACT_CANDIDATE_REQUEST')active=true;
  try{return {success:true,data:type==='PAGE_CONTEXT_REQUEST'?await detectContext(document):await extractAll(document)};}
  catch(error){return {success:false,error:safeError(error)};}
  finally{if(type==='EXTRACT_CANDIDATE_REQUEST')active=false;}
};
