import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  initialized: boolean
  mfaRequired: boolean
  mfaFactorId: string | null
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  initialize: () => Promise<void>
  verifyMfa: (code: string) => Promise<string | null>
  enrollMfa: () => Promise<{ qrCode: string; secret: string; factorId: string } | null>
  confirmMfaEnrollment: (factorId: string, code: string) => Promise<string | null>
  unenrollMfa: () => Promise<string | null>
  isMfaEnabled: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,
  mfaRequired: false,
  mfaFactorId: null,

  initialize: async () => {
    const { data } = await supabase.auth.getSession()
    set({
      session: data.session,
      user: data.session?.user ?? null,
      initialized: true,
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
    })
  },

  signIn: async (email, password) => {
    set({ loading: true })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ loading: false })
      return error.message
    }

    // Sjekk om MFA er påkrevd
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.[0]
      if (totp) {
        set({ loading: false, mfaRequired: true, mfaFactorId: totp.id })
        return null
      }
    }

    set({ loading: false })
    return null
  },

  verifyMfa: async (code: string) => {
    const { mfaFactorId } = get()
    if (!mfaFactorId) return 'Ingen MFA-faktor funnet'

    set({ loading: true })
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code })
    set({ loading: false })

    if (error) return error.message
    set({ mfaRequired: false, mfaFactorId: null })
    return null
  },

  signUp: async (email, password) => {
    set({ loading: true })
    const { error } = await supabase.auth.signUp({ email, password })
    set({ loading: false })
    return error?.message ?? null
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, mfaRequired: false, mfaFactorId: null })
  },

  enrollMfa: async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Lommeboka',
    })
    if (error || !data) return null
    return {
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      factorId: data.id,
    }
  },

  confirmMfaEnrollment: async (factorId: string, code: string) => {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    return error?.message ?? null
  },

  unenrollMfa: async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totp = factors?.totp?.[0]
    if (!totp) return 'Ingen MFA-faktor funnet'
    const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id })
    return error?.message ?? null
  },

  isMfaEnabled: async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    return (data?.totp?.length ?? 0) > 0
  },
}))
