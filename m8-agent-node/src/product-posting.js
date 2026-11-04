// Product-first editorial copy for Cash Flow Engine #001.
// Uses only fields returned by the official Rakuten API; never implies ownership or usage.
export function cleanProductName(value = '') {
  return String(value).replace(/[\r\n\t]/g, ' ').replace(/【[^】]{0,36}】/g, ' ')
    .replace(/\[[^\]]{0,36}\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 65);
}

export function roleForSlot(slot, slots, dayNumber = 1) {
  const index = slots.indexOf(slot);
  if (index < 0) return 'discovery';
  if (slots.length === 1) return 'discovery';
  if (slots.length === 2) return index === 0 ? 'discovery' : 'revenue';
  if (index === 0) return 'discovery';
  if (index === 1) return 'revenue';
  // Alternating comparison and a second discovery gives ~50% discovery over six slots.
  if (index === 2) return dayNumber % 2 === 0 ? 'comparison' : 'discovery';
  return index % 3 === 1 ? 'revenue' : 'discovery';
}

export function editorialText(item, mode = 'discovery') {
  const name = cleanProductName(item?.itemName);
  if (!name) return null;
  const price = Number(item?.price);
  const priceLine = price > 0 ? `掲載時の価格は約${price.toLocaleString('ja-JP')}円。価格は変動することがあります。` : '';
  const reviews = Number(item?.reviewCount) >= 30
    ? `レビューは${Number(item.reviewCount).toLocaleString('ja-JP')}件。` : '';
  if (mode === 'comparison') {
    return [
      '便利グッズを選ぶとき、どこを見る？',
      `今日見つけたのは「${name}」。`,
      [priceLine, reviews].filter(Boolean).join(' '),
      '買う前にサイズ・置き場所・お手入れのしやすさを比較しておきたい。',
      'こういうアイテム、あなたなら何を重視する？'
    ].filter(Boolean).join('\n\n').slice(0, 500);
  }
  return [
    'こんなの見つけた！👀',
    `「${name}」っていうアイテム。`,
    [priceLine, reviews].filter(Boolean).join(' '),
    '気になる……！ サイズや使い勝手を確認してみたい。',
    '使っている人がいたら感想を聞きたいな。'
  ].filter(Boolean).join('\n\n').slice(0, 500);
}

export function revenueText(item) {
  const name = cleanProductName(item?.itemName);
  if (!name || !/^https:\/\//.test(String(item?.affiliateUrl || ''))) return null;
  const price = Number(item.price) > 0 ? `掲載時の価格は約${Number(item.price).toLocaleString('ja-JP')}円（変動あり）。` : '';
  const url = item.affiliateUrl;
  const head = [ '【PR・アフィリエイト】', '今日気になった便利グッズはこちら👇', `「${name}」`, price,
    '購入前に商品ページでサイズ・仕様・レビューを確認してね。', '商品詳細はこちら' ].filter(Boolean).join('\n');
  if (url.length > 470) return null; // Do not publish truncated affiliate links.
  return `${head.slice(0, 499 - url.length - 1)}\n${url}`;
}
