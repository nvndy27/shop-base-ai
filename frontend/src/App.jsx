import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/layout';
import Home from './pages/Home';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import LoginRegister from './pages/LoginRegister';
import Profile from './pages/Profile';
import Chat from './pages/Chat';
import AuthCallback from './pages/AuthCallback';
import { hasAuthReturn } from './auth/return';
import Settings from './pages/Settings';
import RequirePurchase from './auth/RequirePurchase';
import Marketplace from './pages/Marketplace';
import Seller from './pages/Seller';
import Addresses from './pages/Addresses';
import ProductModeration from './pages/ProductModeration';
import { AccountDemo, DemoProfile } from './pages/AccountDemo';
import { AuthProvider, RequireAuth } from './auth/AuthContext';
// import SellerDashboard from './pages/SellerDashboard'; // placeholder

function HomeOrAuthReturn() {
  const location = useLocation();
  return hasAuthReturn(location.search, location.hash) ? <AuthCallback /> : <Home />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomeOrAuthReturn />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/seller" element={<RequireAuth><Seller /></RequireAuth>} />
          <Route path="/addresses" element={<RequireAuth><Addresses /></RequireAuth>} />
          <Route path="/admin/products" element={<RequireAuth><ProductModeration /></RequireAuth>} />
          {/* Buying requires a session: guests are redirected to sign in. */}
          <Route path="/cart" element={<RequireAuth><Cart /></RequireAuth>} />
          <Route path="/checkout" element={<RequireAuth><RequirePurchase><Checkout /></RequirePurchase></RequireAuth>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
          <Route path="/auth" element={<LoginRegister />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
          {import.meta.env.DEV && (
            <Route path="/demo" element={<AccountDemo />}>
              <Route index element={<Navigate to="cart" replace />} />
              <Route path="cart" element={<Cart demo />} />
              <Route path="orders" element={<Orders demo />} />
              <Route path="profile" element={<DemoProfile />} />
            </Route>
          )}
          {/* Redirect unknown paths to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
