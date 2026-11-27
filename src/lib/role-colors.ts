import { NO_ROLE } from '@/types';

// 役割ごとの色（管理画面の割り振り・必要人数の表で、どの役割かをひと目で分けるため）。
// 2026-11-27 本人の要望: 「PC 青、加入 赤とか」。ほかの役割は Claude が重ならない色を選んだ。
// Tailwind は文字列をそのまま拾ってクラスを作るので、クラス名は組み立てずに丸ごと書く。
const ROLE_CLASS: Record<string, string> = {
  PC: 'border-blue-300 bg-blue-100 text-blue-900',
  加入: 'border-red-300 bg-red-100 text-red-900',
  共済: 'border-red-300 bg-red-100 text-red-900', // 「加入」の旧名（終わった枠の記録）
  受付: 'border-green-300 bg-green-100 text-green-900',
  アテンド: 'border-orange-300 bg-orange-100 text-orange-900',
  全体会: 'border-purple-300 bg-purple-100 text-purple-900',
  ミルパス: 'border-cyan-300 bg-cyan-100 text-cyan-900',
  学び: 'border-yellow-300 bg-yellow-100 text-yellow-900',
  コアメンバー: 'border-pink-300 bg-pink-100 text-pink-900',
};

const NO_ROLE_CLASS = 'border-gray-300 bg-gray-50 text-gray-500';
const UNKNOWN_CLASS = 'border-gray-300 bg-white text-gray-900';

/** 枠線・背景・文字の色のクラス */
export function roleColorClass(role: string): string {
  if (role === NO_ROLE) return NO_ROLE_CLASS;
  return ROLE_CLASS[role] ?? UNKNOWN_CLASS;
}
