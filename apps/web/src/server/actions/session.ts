'use server'

import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { signIn, signOut } from '@/server/auth'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your e-mail address.'),
  password: z.string().min(1, 'Enter your password.'),
})

export interface SignInState {
  readonly error?: string
}

/**
 * Sign-in never says which half was wrong. "No account with that e-mail" is a
 * free account-enumeration oracle, and the credential lookup already takes the
 * same time either way.
 */
export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    })
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return { error: 'Those credentials do not match an active account.' }
    }
    throw error
  }

  redirect('/')
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/sign-in' })
}
