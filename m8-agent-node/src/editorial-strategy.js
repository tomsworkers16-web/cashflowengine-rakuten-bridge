// Cash Flow Engine editorial media MVP: reader value first, conversion where relevant.
// Research lanes are PROXIES, not verified historical sales or future forecasts.
export const EDITORIAL_POLICY_VERSION = 'reader-first-mvp-20261110';

const TOPICS = [
  ['買う前のチェック','収納グッズはサイズだけでなく、取り出すときの動線も確認したい。置き場所に収まっても、毎日使いにくければ意味がないですよね。','収納用品なら、寸法と使う頻度のどちらを重視する？'],
  ['小さな不便を減らす','ケーブルが増えて困るなら、まず「どこで何を充電するか」を整理。新しいガジェットを買う前に、置き場所と端子の種類を確認すると失敗を減らせそう。','充電まわりで一番困っていることは？'],
  ['旅行道具の選び方','旅行の便利グッズは、多機能さより荷物が本当に軽くなるかを優先したい。自宅でしか使わない機能が増えると、持ち運ぶ意味が薄れますよね。','旅行に必ず持っていく便利アイテムはある？'],
  ['キッチンの使いやすさ','キッチン用品を選ぶときは便利そうな機能だけでなく、洗いやすさも確認。使う時間より後片付けの時間が長いと、結局出番が減りがち。','調理道具で「洗うのが面倒」と感じるものは？'],
  ['文房具の発見','文房具は高機能なものより、使うたびに感じる小さなストレスを減らす道具が気になります。持ちやすさ、補充のしやすさ、収納性も大切。','毎日使っているお気に入りの文房具は？'],
  ['掃除道具の選び方','掃除グッズは汚れが取れるかだけでなく、準備と片付けが簡単かも大事。すぐ手に取れる場所に置けるものだと、使うハードルを下げやすそう。','掃除で一番面倒な工程はどこ？'],
  ['買い物で後悔しない','便利グッズを買う前の3つの確認。①今の不便が具体的か ②置き場所があるか ③手入れを続けられるか。流行っているだけなら一度保留にするのも手。','買ってから出番が減った道具ってある？'],
  ['デスク環境を整える','デスク用ガジェットは、まず配線・設置面積・電源の位置を確認。機能の多さより、机が使いやすくなるかで選びたい。','デスクまわりで改善したい場所は？'],
  ['長く使う道具','定番の道具には、替え部品や消耗品が手に入りやすいという利点も。価格だけでなく、数年後も使い続けられるかを調べたい。','長く使っているお気に入りの道具は？'],
  ['スマホ周辺機器の注意点','スマホアクセサリーは「対応機種」と「端子」を最初に確認。レビューが高くても、自分の機種で使えなければ便利グッズにならない。','アクセサリー選びで失敗したことはある？'],
  ['片付けの発想','収納用品を増やす前に、よく使うものを手前に置く工夫から試すのもあり。新しい収納は、それでも不便が残る場所を見つけてから。','家で一番片付けにくい場所はどこ？'],
  ['時間を節約する','「時短グッズ」は、使い始める準備と片付けも含めて考えたい。作業時間が少し短くなっても、準備が増えるなら自分には合わないかもしれません。','普段どんな作業を短縮したい？'],
  ['メンテナンスの視点','家電や日用品は、本体の価格だけでなくフィルターなどの交換費用も確認したい。長く使うものほど、ランニングコストが重要になりそう。','購入前に消耗品の値段までチェックする？'],
  ['季節の便利アイテム','季節商品は必要な時期が短いことも。買う前に「保管場所」と「翌年も使えるか」を考えておくと、オフシーズンに困りにくい。','季節用品の収納で困ることはある？']
];

export function editorialGuide(jstDate, slot='07:30'){
  const d=Date.parse(String(jstDate)+'T00:00:00Z');
  if(!Number.isFinite(d))return null;
  // Independent of Rakuten inventory. Stable across retries, varied across days/slots.
  const slotOffset=String(slot).split(':').reduce((n,x)=>n+Number(x||0),0);
  const index=(Math.floor(d/86400000)*2+slotOffset)%TOPICS.length;
  const [title,body,question]=TOPICS[index];
  return [title+'｜ちょっと便利な暮らしのヒント',body,question].join('\n\n');
}

export function researchLane(jstDate){
  const day=Number(String(jstDate).slice(-2));
  if(!Number.isFinite(day))return 'niche_proxy';
  if(day%5===3)return 'emerging_proxy';
  if(day%5===4)return 'popular_proxy';
  return 'niche_proxy';
}

export function researchSort(lane){
  return lane==='emerging_proxy' ? '-updateTimestamp' : '-reviewCount';
}

export function researchScore(item,lane){
  const reviews=Number(item?.reviewCount||0),rating=Number(item?.reviewAverage||0);
  const price=Number(item?.price||0);
  let score=0;
  if(rating>=4.3)score+=25;else if(rating>=4.0)score+=15;
  if(price>=1800&&price<=12000)score+=15;else if(price>0)score+=5;
  if(lane==='niche_proxy'){
    // A moderate review count may identify an overlooked candidate.
    if(reviews>=30&&reviews<500)score+=30;
    else if(reviews>=500&&reviews<2000)score+=12;
  }else if(lane==='popular_proxy'){
    if(reviews>=1000)score+=30;else if(reviews>=200)score+=15;
  }else if(lane==='emerging_proxy'){
    // Recently updated != recently launched, and low reviews != future hit.
    if(reviews>=5&&reviews<150)score+=25;
    else if(reviews<500)score+=10;
  }
  return score;
}
