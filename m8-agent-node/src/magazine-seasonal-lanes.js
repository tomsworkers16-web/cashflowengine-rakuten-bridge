// Calendar hypotheses, not observed demand. Bounded expansion: two extra searches per scan.
const lanes=[
 {months:[11,12,1,2],id:'winter-warmth',keyword:'電気毛布 ひざ掛け',title:'部屋全体を暖める？自分のいる場所だけ暖める？',angles:['暖房を使う場面を考える','電気毛布のサイズ・温度調節・手入れを確認する','使用上の注意をメーカーの説明で確認する'],match:/電気毛布|電気ひざ掛け/u},
 {months:[11,12,1,2],id:'winter-cleaning',keyword:'窓 掃除 スクイージー',title:'窓掃除の道具、何を選べば片付けまで楽になる？',angles:['窓の広さと手の届く範囲','水切りの幅と保管場所','対応する素材と使用方法'],match:/スクイージー|水切りワイパー/u},
 {months:[3,4,5],id:'spring-laundry',keyword:'洗濯 物干し 室内',title:'新生活の洗濯、干す場所から考えてみよう',angles:['干す量と置き場所','収納時の寸法','耐荷重と設置条件'],match:/物干し/u},
 {months:[3,4,5],id:'spring-lunch',keyword:'弁当箱 ランチボックス',title:'お弁当箱は、詰めるときより洗うときが大事？',angles:['容量と持ち運び','パーツと洗い方','電子レンジの適合条件'],match:/弁当箱|ランチボックス/u},
 {months:[6,7,8,9,10],id:'warm-drink',keyword:'水筒 マグボトル',title:'毎日持ち歩く水筒、どこを見て選ぶ？',angles:['容量と重さ','飲み口と洗い方','保温保冷の仕様'],match:/水筒|マグボトル/u},
 {months:[6,7,8,9,10],id:'warm-laundry',keyword:'洗濯 速乾 ハンガー',title:'洗濯物を干すとき、風の通り道を考える',angles:['干す場所と間隔','ハンガーの形状','収納方法'],match:/ハンガー/u}
];
export function seasonalMagazineIssues(day,slot){
 const month=Number(day.slice(5,7));
 return lanes.filter(l=>l.months.includes(month)).map(l=>({day,slot,topicId:l.id,series:'季節の暮らし',title:l.title,researchKeyword:l.keyword,format:slot==='07:30'?'short':slot==='12:30'?'medium':'feature',text:l.angles.join('。')+'。',editorialAngles:l.angles,evidence:'calendar_hypothesis_not_observed_demand'}));
}
export function seasonalTitleMatches(topicId,title){
 const lane=lanes.find(l=>l.id===topicId);
 return lane?lane.match.test(title):false;
}
