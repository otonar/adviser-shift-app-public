// 外部リンク集（/dashboard/links）の中身。
//
// ===========================================================================
// ★ リンクを足す・URL を変える・非表示にするときは、このファイルだけ直せば済む。
//   直したあと `git push` すると Vercel が自動で反映する（DB の操作は要らない）。
//
//   ・URL がまだ決まっていない項目は `hidden: true` のまま置いておく。
//     決まったら url を書き換えて hidden の行を消せば、その場で表に出る。
//   ・並び順はこの配列の順番がそのまま画面の順番になる。
//   ・QR コードは url から自動で作られる（画像を用意する必要はない）。
//   ・ポスター画像は public/links/ に置いて、src を '/links/ファイル名' にする。
//     width/height は画像の実寸（縦横比を保つために使う。表示サイズではない）。
// ===========================================================================

export type ExternalLinkSection = {
  /** 開閉の判定に使う一意な id。あとから変えると開閉状態がリセットされるだけで実害はない。 */
  id: string;
  /** 見出しの先頭に出す絵文字。 */
  emoji: string;
  /** 見出し。 */
  title: string;
  /** 補足説明（任意）。 */
  description?: string;
  /** リンクボタン（任意）。QR はこの url から作る。 */
  link?: { url: string; label: string };
  /** ポスター画像（任意）。 */
  poster?: { src: string; alt: string; width: number; height: number };
  /** true の間は画面に出さない（URL 未定・掲載前の下書き置き場）。 */
  hidden?: boolean;
};

const SECTIONS: ExternalLinkSection[] = [
  {
    id: 'univ',
    emoji: '🌐',
    title: '山梨大学HP',
    link: { url: 'https://www.yamanashi.ac.jp/', label: '大学公式ホームページ' },
  },
  {
    id: 'freshman',
    emoji: '🎓',
    title: '新入生応援サイト2026',
    link: {
      url: 'https://text.univ.coop/puk/START/yamanashi/',
      label: '新入生向けホームページ',
    },
  },
  {
    id: 'coop',
    emoji: '👥',
    title: '山梨大学生活協同組合',
    link: {
      url: 'https://www.univcoop.jp/yamanashi/',
      label: '梨大生協公式ホームページ',
    },
  },
  {
    // TODO: アンケートの URL が決まったら url を入れて hidden を消す
    id: 'questionnaire',
    emoji: '📝',
    title: '来場者用アンケート',
    link: { url: '', label: 'アンケートはこちらから' },
    hidden: true,
  },
  {
    // TODO: 応募フォームの URL が決まったら url を入れて hidden を消す
    id: 'entry',
    emoji: '📋',
    title: '新パ応募フォーム',
    description: '応募はこちらから',
    link: { url: '', label: '応募フォームを開く' },
    hidden: true,
  },
  {
    id: 'rishu',
    emoji: '📄',
    title: '履修相談会',
    poster: {
      src: '/links/rishu.jpg',
      alt: '新入生向け履修相談会の案内（4月3日・4日、甲府西キャンパス）',
      width: 1600,
      height: 2263,
    },
  },
  {
    id: 'calendar',
    emoji: '📅',
    title: '令和8年度学年暦',
    poster: {
      src: '/links/calendar2026.jpg',
      alt: '令和8年度 学年暦（年間予定表）',
      width: 1240,
      height: 1754,
    },
  },
];

/**
 * 画面に出すセクション。
 *
 * hidden のものと、URL の形が不正なリンクを落とす。定数なので普段は素通りするが、
 * 書き間違い（`javascript:` を貼ってしまう等）がそのまま画面に出ないようにしておく。
 */
export function visibleExternalLinks(): ExternalLinkSection[] {
  return SECTIONS.filter((s) => {
    if (s.hidden) return false;
    if (s.link && !isSafeHttpUrl(s.link.url)) return false;
    // リンクもポスターも無いセクションは中身が空なので出さない
    return Boolean(s.link || s.poster);
  });
}

/** http / https だけを通す（javascript: や data: を弾く）。 */
function isSafeHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
