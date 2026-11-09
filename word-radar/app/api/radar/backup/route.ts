import { authorize, json, failure } from '@/lib/radar/http';
import { fullState } from '@/lib/radar/store';
import { buildBackup } from '@/lib/radar/backup';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {await authorize(request);const s=await fullState();return json(buildBackup(s.keywords,s.sources,s.runs,s.snapshots));}
  catch(e){return failure(e);}
}
