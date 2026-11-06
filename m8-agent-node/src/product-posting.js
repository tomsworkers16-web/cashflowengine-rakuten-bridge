// Product-first editorial copy. Uses only official API product data.
export function cleanProductName(value = '', limit = 44) {
  const raw = String(value).replace(/[\r\n\t]/g,' ')
    // Rakuten listings often begin with a dated promotion, before the real
    // product title. Do not let it crowd out the product identity.
    .replace(/^\s*\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}まで[^！!]{0,100}[！!]\s*/u,' ')
    .replace(/《[^》]{0,40}(?:楽天|ランキング|第[１２３123]位)[^》]*》/gu,' ')
    .replace(/【([^】]{0,100})】/gu,(_all,inner)=>
      /送料無料|クーポン|セール|ポイント|エントリー|本日限定|新登場|楽天[１1]位|オトク/u.test(inner)
        ? ' ' : ' '+inner+' ')
    .replace(/\[[^\]]{0,36}\]/g,' ')
    .replace(/\s+/g,' ').trim();
  if (raw.length <= limit) return raw;
  const prefix = raw.slice(0,limit);
  // Keep a complete product keyword, not the chopped-off "フィルタ" from initial posts.
  const lastSpace = prefix.lastIndexOf(' ');
  return lastSpace >= Math.max(8, Math.floor(limit*0.55)) ? prefix.slice(0,lastSpace) : prefix;
}

// Use-case hook is generated only from explicit words in the official listing.
// It is phrased as a question/check, not as an unverified product performance claim.
export function productUseCase(item) {
 const title=cleanProductName(item?.itemName,110);
 if(/(?:洗面台|洗面所)/u.test(title)&&/(?:排水口|ヘアーキャッチャー|ゴミ受け)/u.test(title))
  return '洗面台の排水口、髪の毛の掃除が気になる方は形状をチェック。';
 if(/(?:レンジフード|換気扇)/u.test(title)&&/フィルター/u.test(title))
  return '換気扇まわりのお手入れ、サイズが合うか確認したいアイテム。';
 if(/(?:収納|ラック|棚)/u.test(title))
  return '収納場所に悩んだら、設置寸法を先に確認してみたい。';
 if(/(?:包丁|ナイフ)/u.test(title)&&/(?:スタンド|ホルダー)/u.test(title))
  return 'キッチンの道具置き場、置く場所とサイズを確認したい。';
 return null;
}

export function validatePublicationText(text, {affiliateUrl=null, revenue=false}={}) {
  if (typeof text!=='string'||!text.trim()||text.length>500) return 'invalid_post_length';
  if (/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]|(?:繧[ｦｭｸｹ]|縺[ｾｪｮｨ]|萓ｿ蛻ｩ)/u.test(text))
    return 'suspicious_mojibake_or_control_char';
  if (revenue) {
    if (!text.startsWith('【PR・アフィリエイト】')) return 'pr_disclosure_missing';
    if (typeof affiliateUrl!=='string'||!/^https:\/\//.test(affiliateUrl)||!text.endsWith(affiliateUrl))
      return 'affiliate_url_missing_or_modified';
  }
  return null;
}

export function roleForSlot(slot, slots, dayNumber = 1) {
  const index = slots.indexOf(slot);
  if (index < 0) return 'discovery';
  if (slots.length === 1) return 'discovery';
  if (slots.length === 2) return index === 0 ? 'discovery' : 'revenue';
  if (index === 0) return 'discovery';
  if (index === 1) return 'revenue';
  if (index === 2) return dayNumber % 2 === 0 ? 'comparison' : 'discovery';
  return index % 3 === 1 ? 'revenue' : 'discovery';
}

export function editorialText(item, mode = 'discovery') {
  const name = cleanProductName(item?.itemName);
  if (!name) return null;
  const price = Number(item?.price);
  const priceLine = price > 0 ? `掲載時の価格は約${price.toLocaleString('ja-JP')}円。価格は変動することがあります。` : '';
  const useCase = productUseCase(item);
  const reviews = Number(item?.reviewCount) >= 30
    ? `レビューは${Number(item.reviewCount).toLocaleString('ja-JP')}件。` : '';
  if (mode === 'comparison') {
    return [
      '便利グッズを選ぶとき、どこを見る？',
      `今日見つけたのは「${name}」。`,
      useCase,
      [priceLine, reviews].filter(Boolean).join(' '),
      '買う前にサイズ・置き場所・お手入れのしやすさを比較しておきたい。',
      'こういうアイテム、あなたなら何を重視する？'
    ].filter(Boolean).join('\n\n').slice(0, 500);
  }
  return [
    'こんなの見つけた！👀',
    `「${name}」っていうアイテム。`,
    useCase,
    [priceLine, reviews].filter(Boolean).join(' '),
    '気になる……！ サイズや使い勝手を確認してみたい。',
    '使っている人がいたら感想を聞きたいな。'
  ].filter(Boolean).join('\n\n').slice(0, 500);
}

// Rotate evidence-free copy hypotheses by JST calendar day. This is an A/B
// experiment, not proof of causation or a promise of conversion lift.
export function revenueCopyVariant(jstDay) {
 const day=String(jstDay||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return 'spec_check';
 const d=Number(day.slice(-2));
 return d%2===0 ? 'compare_before_buy' : 'spec_check';
}

export function revenueText(item, variant='spec_check') {
  const url = String(item?.affiliateUrl || '');
  const name = cleanProductName(item?.itemName);
  if (!name || !/^https:\/\//.test(url) || url.length>470) return null;
  const useCase = productUseCase(item);
  const price = Number(item.price)>0
    ? `掲載時の価格：約${Number(item.price).toLocaleString('ja-JP')}円（変動あり）` : '';
  // Never trim away required disclosure, sentence endings, or the affiliate URL.
  const lead = variant==='compare_before_buy' ? '買う前に比較したい便利グッズ' : '今日の便利グッズ';
  const cta = variant==='compare_before_buy' ? 'サイズ・仕様・送料を商品ページで比較してみてください。' : '購入前にサイズ・仕様を確認してね。';
  const variants = [
    ['【PR・アフィリエイト】', lead, `「${name}」`, useCase, price,
      cta, url],
    ['【PR・アフィリエイト】', `「${cleanProductName(item.itemName,25)}」`, price,
      '商品詳細はこちら',url],
    ['【PR・アフィリエイト】',`「${cleanProductName(item.itemName,16)}」`,url]
  ];
  for(const parts of variants){
    const text=parts.filter(Boolean).join('\n');
    if(!validatePublicationText(text,{revenue:true,affiliateUrl:url}))return text;
  }
  return null;
}
