import { redirect } from 'next/navigation';

// 「確定した役割」はシフト画面の切り替えに統合した。
// 旧 URL（ブックマーク・過去の通知リンク）が壊れないよう、そのまま転送する。
export default function MyRolesPage() {
  redirect('/dashboard/shifts?view=roles');
}
