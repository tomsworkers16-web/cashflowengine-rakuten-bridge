// Offline pilot: use exact item-bound copy, never publish or call external APIs.
import {loadListingSnapshot,asciiJson} from './magazine-listing-snapshot.js';
import {buildEditorialPacket} from './magazine-editorial-packet.js';
const articles=[
 {strategy:'turnoverOriented',itemCode:'latuna:10000000',text:'洗い物のあと、調理スペースを広く使いたい日もありますよね。水切りラックを選ぶなら、使う場所と片付ける場所をセットで考えてみませんか？シンクに合う幅か、まず確認しておきたいところ。'},
 {strategy:'rewardOriented',itemCode:'rack-town:10000550',text:'まな板を置いたら台所がいっぱい。水切りラックの置き場所を、シンクの上に変えるという選択肢もあります。2段タイプを選ぶなら、蛇口の高さや設置面、食器を取りやすい位置を買う前に確認したいですね。'}
];
try{
 const path=process.argv[2];if(!path)throw Error('snapshot_path_required');
 const packet=await buildEditorialPacket(await loadListingSnapshot(path),{articles});
 const entries=packet.entries.map(({strategy,itemCode,product,draft})=>({strategy,itemCode,itemName:product.itemName,price:product.price,status:draft?.status||'article_missing',characters:draft?.characters??null,error:draft?.error??null,review:draft?.review??null,text:draft?.text??null}));
 const ready=entries.length===2&&entries.every(e=>e.status==='manual_review_required'&&e.text);
 console.log(asciiJson({status:ready?'drafts_ready_for_manual_review':'drafts_need_work',entries,comparisonEligible:packet.comparisonEligible,publicationAllowed:false}));
 if(!ready)process.exitCode=2;
}catch{console.error(JSON.stringify({status:'failed',reason:'offline_editorial_packet_failed'}));process.exitCode=1;}
