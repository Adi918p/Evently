const express = require('express');
const { authM } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');
const controller = require('../Controllers/experienceController');

const publicRouter = express.Router();
publicRouter.get('/', controller.listPublished);

const adminRouter = express.Router();
adminRouter.use(authM, requireAdmin);
adminRouter.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
adminRouter.get('/', controller.listAll);
adminRouter.post('/', controller.create);
adminRouter.put('/:id', controller.update);
adminRouter.delete('/:id', controller.remove);

module.exports = { publicRouter, adminRouter };
