import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import {
  loadPartnership,
  invitePartner,
  acceptInvitation,
  disconnectPartner,
  loadPartnerData,
  importPartnerDataToStore,
  subscribeToPartnerData,
  buildInviteLink,
  sendInviteEmail,
  type Partnership,
} from '@/lib/partnerSync'

export type PartnershipStatus = 'none' | 'pending_sent' | 'pending_received' | 'connected'

interface PartnershipState {
  partnership: Partnership | null
  status: PartnershipStatus
  inviteLink: string | null
  loading: boolean
  error: string | null
  _unsubscribe: (() => void) | null

  initialize: () => Promise<void>
  invite: (email: string) => Promise<void>
  accept: (partnershipId: string) => Promise<void>
  disconnect: () => Promise<void>
  clearError: () => void
}

function deriveStatus(p: Partnership, userId: string): PartnershipStatus {
  if (p.status === 'accepted') return 'connected'
  if (p.status === 'pending' && p.inviter_id === userId) return 'pending_sent'
  if (p.status === 'pending') return 'pending_received'
  return 'none'
}

function getPartnerId(p: Partnership, userId: string): string | null {
  if (p.status !== 'accepted') return null
  return p.inviter_id === userId ? p.invitee_id : p.inviter_id
}

export const usePartnershipStore = create<PartnershipState>((set, get) => ({
  partnership: null,
  status: 'none',
  inviteLink: null,
  loading: false,
  error: null,
  _unsubscribe: null,

  initialize: async () => {
    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false, status: 'none', partnership: null }); return }

      const p = await loadPartnership()
      if (!p) { set({ partnership: null, status: 'none', inviteLink: null, loading: false }); return }

      const status = deriveStatus(p, user.id)
      const inviteLink = status === 'pending_sent' ? buildInviteLink(p.id) : null

      set({ partnership: p, status, inviteLink, loading: false })

      // Koblet — last inn partnerdata og abonner på endringer
      if (status === 'connected') {
        const partnerId = getPartnerId(p, user.id)
        if (partnerId) {
          const partnerData = await loadPartnerData(partnerId)
          if (partnerData) importPartnerDataToStore(partnerData)

          get()._unsubscribe?.()
          const unsub = subscribeToPartnerData(partnerId, importPartnerDataToStore)
          set({ _unsubscribe: unsub })
        }
      }
    } catch (err) {
      set({ loading: false, error: String(err) })
    }
  },

  invite: async (email: string) => {
    set({ loading: true, error: null })
    const { error, partnership } = await invitePartner(email)
    if (error || !partnership) {
      set({ loading: false, error: error ?? 'Ukjent feil' })
      return
    }
    const inviteLink = buildInviteLink(partnership.id)
    set({ partnership, status: 'pending_sent', inviteLink, loading: false })
    // Send e-post direkte fra appen — feil her er ikke kritisk (lenken kan kopieres manuelt)
    sendInviteEmail(partnership.id)
  },

  accept: async (partnershipId: string) => {
    set({ loading: true, error: null })
    const error = await acceptInvitation(partnershipId)
    if (error) { set({ loading: false, error }); return }
    await get().initialize()
  },

  disconnect: async () => {
    const { partnership, _unsubscribe } = get()
    if (!partnership) return
    set({ loading: true, error: null })
    _unsubscribe?.()
    const error = await disconnectPartner(partnership.id)
    if (error) { set({ loading: false, error }); return }
    set({ partnership: null, status: 'none', inviteLink: null, loading: false, _unsubscribe: null })
  },

  clearError: () => set({ error: null }),
}))
