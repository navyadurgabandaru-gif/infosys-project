const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listIngredients,
  getIngredient,
  getMyIngredientInsights,
  getInteractionsCatalog,
  getIngredientEducationById,
  getMyRoutineInteractions,
} = require('../controllers/ingredientController');

const router = express.Router();

// Specific/static routes must be registered before the /:id param route
// so they aren't swallowed by it.
router.get('/for-me', protect, getMyIngredientInsights);
router.get('/for-me/interactions', protect, getMyRoutineInteractions);
router.get('/interactions', getInteractionsCatalog);
router.get('/', listIngredients);
router.get('/:id/education', getIngredientEducationById);
router.get('/:id', getIngredient);

module.exports = router;
