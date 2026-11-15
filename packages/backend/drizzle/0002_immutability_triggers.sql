CREATE TRIGGER IF NOT EXISTS challenges_immutable_number BEFORE UPDATE OF profile_id, challenge_number ON challenges
        WHEN NEW.profile_id != OLD.profile_id OR NEW.challenge_number != OLD.challenge_number
        BEGIN SELECT RAISE(ABORT, 'Generation numbers and profiles are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS quizzes_immutable_number BEFORE UPDATE OF profile_id, quiz_number ON quizzes
        WHEN NEW.profile_id != OLD.profile_id OR NEW.quiz_number != OLD.quiz_number
        BEGIN SELECT RAISE(ABORT, 'Generation numbers and profiles are immutable'); END;
