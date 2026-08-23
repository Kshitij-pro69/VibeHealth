import { Router } from 'express';
import { getAllUsers, getAdminStats, toggleUserStatus } from '../controllers/adminController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

// Guard all admin routes with requireAuth and requireRole('admin')
router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/users', getAllUsers);
router.get('/stats', getAdminStats);
router.put('/users/:id/toggle-status', toggleUserStatus);

export default router;
