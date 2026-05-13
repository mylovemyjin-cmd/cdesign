import { create } from 'zustand';
import api from '../utils/api';

const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('dt_token'),

  login: async (employeeId, password) => {
    const { data } = await api.post('/auth/login', { employeeId, password });
    localStorage.setItem('dt_token', data.token);
    set({ user: data.user, token: data.token });
  },

  logout: () => {
    localStorage.removeItem('dt_token');
    set({ user: null, token: null });
  },

  fetchMe: async () => {
    const { data } = await api.get('/auth/me');
    set({ user: data });
  },

  // 역할 체크 헬퍼
  hasRole: (minRole) => {
    const LEVEL = { HQ: 4, TL: 3, MB: 2, VW: 1 };
    const user = useAuthStore.getState().user;
    return user ? LEVEL[user.role] >= LEVEL[minRole] : false;
  },
}));

export default useAuthStore;
