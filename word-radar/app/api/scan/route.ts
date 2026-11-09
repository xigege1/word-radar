import { authorize,readBody,keysFrom,json,failure } from '@/lib/radar/http';
import { runScan } from '@/lib/radar/scan-run';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  try {await authorize(request);const b=await readBody(request);if(typeof b.sourceId!=='string')throw new Error('缺少数据源');
    const run=await runScan(b.sourceId,keysFrom(b));
    return json({run},run.status==='error'?502:200);
  }catch(e){return failure(e);}
}
