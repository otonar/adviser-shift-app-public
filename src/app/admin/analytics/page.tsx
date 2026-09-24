import { redirect } from 'next/navigation';
import { authenticateAdmin } from '@/lib/middleware';
import { fetchAnalytics, type Analytics } from '@/lib/analytics-queries';
import { DAY_ROLES, TRAINING_ROLES } from '@/types';

// 管理画面: 分析ダッシュボード。
// 「誰に声をかければいいか」「どの役割が足りていないか」を一目で分かるようにする。
// 数字は既に DB にあるものだけで出す＝運用側に新しい入力作業を増やさない。
//
// 押して動く要素が無いのでサーバーだけで組み立てる（クライアント JS なし）。
export default async function AdminAnalyticsPage() {
  const auth = await authenticateAdmin();
  if (!auth.ok) redirect('/admin');

  let data: Analytics | null = null;
  try {
    data = await fetchAnalytics();
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-bold">分析</h1>
        <p className="text-sm text-red-600">読み込みに失敗しました。</p>
      </div>
    );
  }

  const rate = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));
  const overallRate = rate(data.overall.submitted, data.overall.targeted);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">分析</h1>
        <p className="mt-1 text-sm text-gray-500">
          シフト希望の提出状況と、役割の割り振りの偏りをまとめています。
        </p>
      </div>

      {/* サマリー */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="在籍メンバー" value={`${data.activeMemberCount} 人`} />
        <Stat label="シフト枠" value={`${data.totalSlots} 件`} />
        <Stat
          label="提出率（締切済み）"
          value={overallRate === null ? '—' : `${overallRate}%`}
          note={
            data.overall.targeted > 0
              ? `${data.overall.submitted}/${data.overall.targeted} 件`
              : '対象なし'
          }
        />
        <Stat label="受付中の枠" value={`${data.openSlots.length} 件`} />
      </section>

      {/* 1. 受付中の枠ごとの提出状況 */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-bold">受付中の枠と未提出者</h2>
          <p className="text-xs text-gray-500">
            締切が近い順。名前は「まだ出していない人」です（脱退者は除く）。
          </p>
        </div>
        {data.openSlots.length === 0 ? (
          <p className="text-sm text-gray-500">受付中の枠はありません。</p>
        ) : (
          data.openSlots.map((s) => {
            const r = rate(s.submittedCount, s.targetCount);
            return (
              <article key={s.slotId} className="rounded border bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold">{s.date}</span>
                  <span className="text-gray-500">
                    （{s.slotType === 'day' ? '当日' : '研修'}）
                    {hm(s.startTime)}〜{hm(s.endTime)}
                  </span>
                  {s.expired && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-700">
                      締切済み
                    </span>
                  )}
                  <span className="ml-auto text-sm">
                    <span className="font-bold">
                      {s.submittedCount}/{s.targetCount}
                    </span>
                    {r !== null && (
                      <span className="ml-1 text-gray-500">（{r}%）</span>
                    )}
                  </span>
                </div>

                <Bar value={s.submittedCount} max={s.targetCount} />

                {s.notSubmitted.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">全員提出済み ✓</p>
                ) : (
                  <p className="mt-2 text-sm">
                    <span className="text-gray-500">未提出 </span>
                    <span className="text-gray-800">
                      {s.notSubmitted.join('、')}
                    </span>
                  </p>
                )}
              </article>
            );
          })
        )}
      </section>

      {/* 2. メンバーごとの提出率 */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="font-bold">メンバーごとの提出率</h2>
          <p className="text-xs text-gray-500">
            締切が過ぎた枠だけを数えています（これから出せる枠は含めません）。低い順。
          </p>
        </div>
        {data.members.length === 0 ? (
          <p className="text-sm text-gray-500">
            集計できる枠がまだありません（締切を過ぎた枠が必要です）。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] border-collapse bg-white text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="p-2">名前</th>
                  <th className="p-2">提出</th>
                  <th className="p-2 w-1/3">提出率</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => {
                  const r = rate(m.submitted, m.targeted);
                  return (
                    <tr key={m.userId} className="border-b">
                      <td className="p-2">{m.name}</td>
                      <td className="p-2 whitespace-nowrap text-gray-600">
                        {m.submitted}/{m.targeted}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Bar value={m.submitted} max={m.targeted} compact />
                          <span
                            className={`w-10 shrink-0 text-right text-xs ${
                              r !== null && r < 50
                                ? 'font-bold text-amber-700'
                                : 'text-gray-500'
                            }`}
                          >
                            {r === null ? '—' : `${r}%`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. 欠員傾向 */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="font-bold">役割ごとの充足</h2>
          <p className="text-xs text-gray-500">
            割り振り済み（調整中・確定）の枠が対象。必要人数に対して実際に埋まった人数です。
          </p>
        </div>
        {data.shortfalls.length === 0 ? (
          <p className="text-sm text-gray-500">
            必要人数が設定された枠がまだありません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse bg-white text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="p-2">役割</th>
                  <th className="p-2">種別</th>
                  <th className="p-2">充足</th>
                  <th className="p-2">不足</th>
                  <th className="p-2">足りない枠</th>
                </tr>
              </thead>
              <tbody>
                {data.shortfalls.map((s) => {
                  const short = s.required - s.assigned;
                  return (
                    <tr key={`${s.slotType}:${s.role}`} className="border-b">
                      <td className="p-2 font-medium">{s.role}</td>
                      <td className="p-2 text-gray-500">
                        {s.slotType === 'day' ? '当日' : '研修'}
                      </td>
                      <td className="p-2 whitespace-nowrap text-gray-600">
                        {s.assigned}/{s.required}
                      </td>
                      <td
                        className={`p-2 whitespace-nowrap ${
                          short > 0 ? 'font-bold text-red-700' : 'text-gray-400'
                        }`}
                      >
                        {short > 0 ? `−${short}` : '—'}
                      </td>
                      <td className="p-2 text-gray-600">
                        {s.shortSlots > 0 ? `${s.shortSlots} 件` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. 役割の偏り */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="font-bold">役割の偏り</h2>
          <p className="text-xs text-gray-500">
            確定済みの枠での割り当て回数。多い順なので、下に「まだ一度も入っていない人」が並びます。
          </p>
        </div>
        {data.roleBalance.length === 0 ? (
          <p className="text-sm text-gray-500">在籍メンバーがいません。</p>
        ) : (
          <RoleBalanceTable rows={data.roleBalance} />
        )}
      </section>
    </div>
  );
}

function RoleBalanceTable({
  rows,
}: {
  rows: Analytics['roleBalance'];
}) {
  // 列は「実際に割り当てが出た役割」だけに絞る（0 ばかりの列で横に広げない）。
  const known = [...new Set([...DAY_ROLES, ...TRAINING_ROLES])];
  const used = known.filter((role) => rows.some((r) => (r.byRole[role] ?? 0) > 0));
  // 定義済みの役割に無いもの（役割なし等）も拾う
  const extra = [
    ...new Set(rows.flatMap((r) => Object.keys(r.byRole))),
  ].filter((role) => !known.includes(role as (typeof known)[number]));
  const columns = [...used, ...extra];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500">
            <th className="p-2">名前</th>
            <th className="p-2">合計</th>
            {columns.map((c) => (
              <th key={c} className="p-2 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="border-b">
              <td className="p-2 whitespace-nowrap">{r.name}</td>
              <td
                className={`p-2 font-bold ${
                  r.total === 0 ? 'text-amber-700' : ''
                }`}
              >
                {r.total}
              </td>
              {columns.map((c) => (
                <td key={c} className="p-2 text-gray-600">
                  {r.byRole[c] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded border bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {note && <p className="text-xs text-gray-400">{note}</p>}
    </div>
  );
}

// 割合の棒。数字だけだと差が掴みにくいので添える。
function Bar({
  value,
  max,
  compact = false,
}: {
  value: number;
  max: number;
  compact?: boolean;
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div
      className={`${compact ? 'h-1.5 flex-1' : 'mt-2 h-2 w-full'} overflow-hidden rounded bg-gray-200`}
    >
      <div
        className={`h-full ${pct >= 100 ? 'bg-green-600' : pct >= 50 ? 'bg-gray-800' : 'bg-amber-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function hm(t: string) {
  return t.slice(0, 5);
}
