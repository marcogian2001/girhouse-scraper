import * as z from 'zod';

/** Better Auth rejects anything shorter, so the form matches the server. */
const password = z.string().min(8).max(128);

export const SignInValidation = z.object({
  email: z.email(),
  password,
});

export const SignUpValidation = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email(),
  password,
});
