import client from './client';

export const getSales = (params) =>
  client.get('/sales', { params });

export const getSale = (id) =>
  client.get(`/sales/${id}`);

export const createSale = (data) =>
  client.post('/sales', data);

export const addProductToSale = (saleId, data) =>
  client.post(`/sales/${saleId}/products`, data);

export const removeProductFromSale = (saleId, saleProductId) =>
  client.delete(`/sales/${saleId}/products/${saleProductId}`);

export const stopSale = (saleId) =>
  client.patch(`/sales/${saleId}/stop`);

export const cancelSale = (saleId) =>
  client.patch(`/sales/${saleId}/cancel`);