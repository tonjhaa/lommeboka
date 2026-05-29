import { useState } from 'react'
import { X } from 'lucide-react'

type Tab = 'privacy' | 'terms'

interface LegalModalProps {
  initialTab?: Tab
  onClose: () => void
}

export function LegalModal({ initialTab = 'privacy', onClose }: LegalModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-background border border-border rounded-xl shadow-xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setTab('privacy')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === 'privacy'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Personvern
            </button>
            <button
              onClick={() => setTab('terms')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === 'terms'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Brukervilkår
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Lukk"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-5 text-sm leading-relaxed space-y-5">
          {tab === 'privacy' ? <PrivacyPolicy /> : <TermsOfService />}
        </div>
      </div>
    </div>
  )
}

function PrivacyPolicy() {
  return (
    <>
      <div>
        <h2 className="text-base font-semibold mb-1">Personvernerklæring</h2>
        <p className="text-xs text-muted-foreground">Sist oppdatert: 29. mai 2026</p>
      </div>

      <Section title="Behandlingsansvarlig">
        <p>
          Lommeboka er en privat applikasjon drevet av Tonje Hårstad.
          Spørsmål om personvern kan sendes til{' '}
          <a href="mailto:tonharstad@gmail.com" className="underline hover:text-foreground">
            tonharstad@gmail.com
          </a>.
        </p>
      </Section>

      <Section title="Hvilke data vi lagrer">
        <p>Når du bruker Lommeboka lagrer vi følgende:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
          <li>E-postadresse og kryptert passord (via Supabase Auth)</li>
          <li>Økonomidata du selv registrerer: budsjett, lønn, gjeld, sparing, skatteoppgjør, abonnementer og forsikringer</li>
          <li>Partnerskapsdata dersom du kobler en partner i appen</li>
        </ul>
        <p className="mt-2">
          Lønnsslipper du laster opp behandles lokalt i nettleseren din og lagres
          ikke i sin helhet i skyen — kun de uttrukne tallene.
        </p>
      </Section>

      <Section title="Formål og rettslig grunnlag">
        <p>
          Dataene brukes utelukkende til å gi deg oversikt over din personlige økonomi.
          Rettslig grunnlag er ditt samtykke (GDPR art. 6 nr. 1 bokstav a), gitt ved
          opprettelse av konto.
        </p>
      </Section>

      <Section title="Lagring og sikkerhet">
        <p>
          Data lagres hos Supabase i Frankfurt, Tyskland (EU). All kommunikasjon skjer
          over kryptert tilkobling (HTTPS/TLS). Databasen er beskyttet med row-level
          security slik at kun du kan lese og endre dine egne data.
        </p>
      </Section>

      <Section title="Deling med tredjeparter">
        <p>Dine økonomidata deles ikke med noen tredjeparter, med ett unntak:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
          <li>
            <strong className="text-foreground">Partner:</strong> Dersom du eksplisitt
            inviterer en partner i appen, får vedkommende lesetilgang til dine
            økonomidata.
          </li>
          <li>
            <strong className="text-foreground">Supabase:</strong> Databehandler for
            lagring og autentisering.
          </li>
          <li>
            <strong className="text-foreground">Vercel Analytics:</strong> Anonymisert
            besøksstatistikk uten personopplysninger.
          </li>
        </ul>
      </Section>

      <Section title="Lagringstid">
        <p>
          Data lagres så lenge kontoen er aktiv. Du kan slette kontoen og alle
          tilhørende data ved å kontakte{' '}
          <a href="mailto:tonharstad@gmail.com" className="underline hover:text-foreground">
            tonharstad@gmail.com
          </a>.
        </p>
      </Section>

      <Section title="Dine rettigheter">
        <p>Under GDPR har du rett til innsyn, retting, sletting og dataportabilitet.
          Send en e-post til adressen over for å benytte deg av disse rettighetene.
          Du har også rett til å klage til Datatilsynet (datatilsynet.no).
        </p>
      </Section>
    </>
  )
}

function TermsOfService() {
  return (
    <>
      <div>
        <h2 className="text-base font-semibold mb-1">Brukervilkår</h2>
        <p className="text-xs text-muted-foreground">Sist oppdatert: 29. mai 2026</p>
      </div>

      <Section title="Om tjenesten">
        <p>
          Lommeboka er et privat verktøy for personlig økonomiforvaltning. Tilgang
          gis kun til inviterte brukere. Tjenesten er ikke åpen for offentlig
          registrering.
        </p>
      </Section>

      <Section title="Ingen finansiell rådgivning">
        <p>
          Lommeboka er et hjelpeverktøy, ikke en finansiell rådgiver. Beregninger
          og prognoser er veiledende og kan inneholde feil. Beslutninger om lån,
          sparing og investeringer bør alltid baseres på egne vurderinger og ved
          behov rådgivning fra kvalifisert fagperson.
        </p>
      </Section>

      <Section title="Ditt ansvar">
        <p>Du er ansvarlig for:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
          <li>Å holde påloggingsinformasjonen din sikker</li>
          <li>At dataene du registrerer er korrekte</li>
          <li>Å ikke dele kontoen din med andre (bruk partner-funksjonen for deling)</li>
        </ul>
      </Section>

      <Section title="Tilgjengelighet og endringer">
        <p>
          Tjenesten tilbys uten garantier for oppetid eller kontinuitet. Den kan
          endres, midlertidig stenges eller avsluttes uten forhåndsvarsel.
        </p>
      </Section>

      <Section title="Ansvarsbegrensning">
        <p>
          Tonje Hårstad er ikke ansvarlig for tap av data, feil i beregninger eller
          andre konsekvenser av bruk av tjenesten.
        </p>
      </Section>

      <Section title="Gjeldende lov">
        <p>Norsk rett gjelder for disse vilkårene.</p>
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-medium mb-1.5">{title}</h3>
      <div className="text-muted-foreground space-y-2">{children}</div>
    </div>
  )
}
