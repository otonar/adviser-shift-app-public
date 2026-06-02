import { redirect } from 'next/navigation';
import { authenticateAdmin } from '@/lib/middleware';
import ProductManager from '@/components/admin/ProductManager';

// 管理画面: 商品・在庫管理（CRUD）。
export default async function AdminProductsPage() {
  const auth = await authenticateAdmin();
  if (!auth.ok) redirect('/admin');

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">商品・在庫管理</h1>
      <ProductManager />
    </div>
  );
}
