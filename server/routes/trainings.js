const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ trainings: [] });
});

module.exports = router;
