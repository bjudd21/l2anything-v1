ALTER TABLE review_items
  ADD COLUMN source_quiz_id INTEGER REFERENCES quizzes(id) ON DELETE SET NULL;
