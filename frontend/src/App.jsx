import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import SalesPage from './pages/SalesPage';
import SaleDetailPage from './pages/SaleDetailPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OrdersPage from './pages/OrdersPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminSales from './pages/admin/AdminSales';
import AdminOrders from './pages/admin/AdminOrders';
import AdminSaleMonitor from './pages/admin/AdminSaleMonitor';

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={
            <div className="min-h-screen">
              <Navbar />
              <main>
                <Routes>
                  <Route path="/"          element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
                  <Route path="/sales/:id" element={<ProtectedRoute><SaleDetailPage /></ProtectedRoute>} />
                  <Route path="/login"     element={<LoginPage />} />
                  <Route path="/register"  element={<RegisterPage />} />
                  <Route path="/orders"    element={
                    <ProtectedRoute><OrdersPage /></ProtectedRoute>
                  } />
                </Routes>
              </main>
            </div>
          } />


          <Route path="/admin" element={
            <AdminRoute><AdminDashboard /></AdminRoute>
          } />
          <Route path="/admin/products" element={
            <AdminRoute><AdminProducts /></AdminRoute>
          } />
          <Route path="/admin/sales" element={
            <AdminRoute><AdminSales /></AdminRoute>
          } />
          <Route path="/admin/sales/:id/monitor" element={
            <AdminRoute><AdminSaleMonitor /></AdminRoute>
          } />
          <Route path="/admin/orders" element={
            <AdminRoute><AdminOrders /></AdminRoute>
          } />
        </Routes>

        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#111827',
              color: '#f9fafb',
              border: '1px solid #1f2937',
              borderRadius: '12px',
            },
            success: { iconTheme: { primary: '#ec4899', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;