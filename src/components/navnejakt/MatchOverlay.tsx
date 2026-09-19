import { Heart } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { GENDER_LABEL, type NameRow } from '@/lib/names/types'

export function MatchOverlay({ name, onSeeMatches, onContinue }: { name: NameRow | null; onSeeMatches: () => void; onContinue: () => void }) {
  return (
    <Dialog open={name !== null} onOpenChange={(o) => { if (!o) onContinue() }}>
      <DialogContent className="max-w-sm text-center">
        {name && (
          <div className="nj-pop flex flex-col items-center gap-5 py-6" aria-describedby={undefined}>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary"><Heart className="h-6 w-6 fill-current" aria-hidden /></span>
            <DialogTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Det er en match</DialogTitle>
            <div>
              <p className="text-5xl sm:text-6xl font-semibold tracking-tight break-words">{name.name}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{GENDER_LABEL[name.gender]}</p>
            </div>
            <p className="text-sm text-muted-foreground">Begge liker dette navnet.</p>
            <div className="flex w-full flex-col gap-2 pt-2">
              <Button onClick={onSeeMatches} size="lg" className="w-full">Se matcher</Button>
              <Button onClick={onContinue} variant="ghost" className="w-full">Fortsett å swipe</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
