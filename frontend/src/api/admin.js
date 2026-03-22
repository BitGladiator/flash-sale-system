import client from './client';

export const getStats = () =>
  client.get('/admin/stats');

export const getAdminOrders = (params) =>
  client.get('/admin/orders', { params });

export const getAdminUsers = (params) =>
  client.get('/admin/users', { params });

export const getSaleMonitor = (saleId) =>
  client.get(`/admin/sales/${saleId}/monitor`);