import client from './client';

export const getProducts = (params) =>
  client.get('/products', { params });

export const getProduct = (id) =>
  client.get(`/products/${id}`);

export const createProduct = (formData) =>
  client.post('/products', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const updateProduct = (id, formData) =>
  client.put(`/products/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const deleteProduct = (id) =>
  client.delete(`/products/${id}`);