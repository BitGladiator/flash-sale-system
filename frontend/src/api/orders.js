import client from './client';
import { v4 as uuidv4 } from 'uuid';

export const placeOrder = (data) =>
  client.post('/orders', data, {
    headers: { 'X-Idempotency-Key': uuidv4() },
  });

export const getOrders = (params) =>
  client.get('/orders', { params });

export const getOrder = (id) =>
  client.get(`/orders/${id}`);