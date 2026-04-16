import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NexoraSimpleHeader } from "@/components/NexoraSimpleHeader";

const P = {
  bg: "#09090D",
  card: "#14141D",
  text: "#FFFFFF",
  muted: "#A0A0AE",
  accent: "#E50914",
  border: "rgba(255,255,255,0.09)",
};

type LegalSection = {
  title: string;
  intro?: string;
  paragraphs: string[];
  bullets?: string[];
  note?: string;
};

const LEGAL_SECTIONS: LegalSection[] = [
  {
    title: "Over deze pagina",
    paragraphs: [
      "Deze pagina beschrijft het juridisch kader waarbinnen Nexora opereert, inclusief onze beleidslijnen rond auteursrecht, privacy, DMCA-klachten, AVG-rechten en de naleving van Europese wetgeving zoals de Digital Services Act (DSA) en de Belgische Auteurswet.",
      "Nexora is een metadata-aggregatiedienst. Dit wil zeggen dat de applicatie zelf geen video- of audiobestanden host, opslaat, distribueert of reproduceert. Nexora functioneert uitsluitend als een doorverwijzingsdienst die openbaar beschikbare stream-bronnen en externe aanbieders indexeert en toegankelijk maakt via één gebruikersinterface.",
      "Door gebruik te maken van Nexora bevestig je dat je deze voorwaarden hebt gelezen, begrepen en aanvaard. Als je het niet eens bent met een van de bepalingen op deze pagina, verzoeken wij je het gebruik van de applicatie te staken.",
    ],
  },
  {
    title: "Aard van de dienst",
    paragraphs: [
      "Nexora heeft geen eigendomsrechten op de content die via externe aanbieders beschikbaar wordt gesteld. Alle audiovisuele werken, titels, afbeeldingen, covers, samenvattingen en overig materiaal zijn en blijven eigendom van de respectievelijke rechthebbenden, studios, productiemaatschappijen en licentiehouders.",
      "De applicatie maakt gebruik van openbare API's, legale datasets (zoals TMDB, IMDB en vergelijkbare bronnen) en door derden aangeboden stream-embeds. Nexora claimt geen licentierecht op deze inhoud en is bij uitsluiting afhankelijk van de rechten die de betrokken externe platforms verlenen.",
      "Geo-restricties, leeftijdslimieten en toegangsblokkades kunnen van toepassing zijn afhankelijk van de toepasselijke wetgeving in jouw land van verblijf. Nexora behoudt zich het recht voor om op elk moment, zonder voorafgaande kennisgeving, de toegang tot specifieke content te beperken, te blokkeren of te verwijderen indien daartoe een juridische, technische of zakelijke aanleiding bestaat.",
    ],
  },
  {
    title: "Auteursrecht & intellectuele eigendom",
    paragraphs: [
      "Alle rechten op de in Nexora getoonde content — inclusief maar niet beperkt tot films, series, documentaires, muziek, graphics, handelsmerken, logo's en productnamen — berusten bij hun respectievelijke eigenaars. Het gebruik van Nexora geeft de gebruiker geen enkele overdracht van of licentie op enig intellectueel eigendomsrecht.",
      "De broncode, het ontwerp, de interface, het logo en alle door Nexora zelf ontwikkelde elementen zijn beschermd door auteursrecht en mogen niet worden gekopieerd, aangepast, gedistribueerd of in afgeleide werken gebruikt worden zonder uitdrukkelijke schriftelijke toestemming.",
      "Het is gebruikers uitdrukkelijk verboden om via Nexora content op te nemen, te downloaden (tenzij de betrokken aanbieder dit toestaat), opnieuw te distribueren, te verkopen of anderszins commercieel te exploiteren.",
    ],
    note: "Verdacht gebruik of misbruik kan leiden tot onmiddellijke opschorting van toegang en melding aan bevoegde autoriteiten.",
  },
  {
    title: "DMCA — Kennisgeving van auteursrechtinbreuk",
    intro: "Digital Millennium Copyright Act (17 U.S.C. § 512)",
    paragraphs: [
      "Hoewel Nexora geen content host, nemen wij kennisgevingen van vermeende auteursrechtinbreuk serieus en verwerken wij deze conform de procedure van de Digital Millennium Copyright Act (DMCA) en vergelijkbare internationale wetgeving.",
      "Als je van mening bent dat jouw auteursrechtelijk beschermd werk via Nexora zonder toestemming beschikbaar wordt gesteld, kun je een formele DMCA-kennisgeving indienen. Alleen substantieel volledige en juiste kennisgevingen worden in behandeling genomen. Een geldige kennisgeving dient de volgende elementen te bevatten:",
    ],
    bullets: [
      "1. Identificatie van het beschermde werk — Geef een nauwkeurige beschrijving van het auteursrechtelijk beschermde werk. Indien meerdere werken worden ingediend, een representatieve lijst met titels en/of registratienummers.",
      "2. Identificatie van het inbreukmakende materiaal — Specificeer zo precies mogelijk het materiaal dat inbreuk zou maken. Vermeld de exacte titelnaam, het in-app pad, een schermafbeelding of een directe verwijzing zodat wij het materiaal kunnen lokaliseren.",
      "3. Jouw contactgegevens — Naam, e-mailadres, postadres en telefoonnummer van de klagende partij of haar gemachtigde vertegenwoordiger. Anonieme kennisgevingen worden niet in behandeling genomen.",
      "4. Verklaring te goeder trouw — Een verklaring dat je er te goeder trouw van overtuigd bent dat het gebruik van het materiaal niet is toegestaan door de auteursrechthebbende, diens vertegenwoordiger of de wet.",
      "5. Verklaring van juistheid en bevoegdheid — Een verklaring, op straffe van meineed, dat de informatie in de kennisgeving juist en volledig is en dat je gemachtigd bent om op te treden namens de eigenaar van het exclusieve recht waarop vermeend inbreuk wordt gemaakt.",
      "6. Handtekening — Een door jou of jouw gemachtigde vertegenwoordiger gezette handtekening, in digitale of fysieke vorm.",
    ],
    note: "Stuur jouw volledige kennisgeving naar: legal@nexoraapp.com — Onjuiste of misleidende kennisgevingen kunnen leiden tot aansprakelijkheid voor geleden schade, kosten en advocatenhonoraria (17 U.S.C. § 512(f)).",
  },
  {
    title: "DMCA — Procedure na ontvangst",
    paragraphs: [
      "Na ontvangst van een geldige DMCA-kennisgeving verbinden wij ons ertoe de volgende stappen te doorlopen binnen een redelijke termijn:",
      "Stap 1 — Intake & validatie: Nexora beoordeelt de kennisgeving op volledigheid en correctheid. Onvolledige kennisgevingen worden teruggestuurd met een verzoek tot aanvulling.",
      "Stap 2 — Identificatie & beoordeling: Wij lokaliseren het beschreven materiaal en beoordelen of de claim voldoende onderbouwd is. Dit kan betekenen dat wij contact opnemen met de betreffende externe aanbieder.",
      "Stap 3 — Actie: Bij een gegronde en volledige kennisgeving wordt de link, de indexering of de toegang tot het materiaal uitgeschakeld of verwijderd. De betrokken gebruiker wordt, indien van toepassing, geïnformeerd.",
      "Stap 4 — Archivering: De kennisgeving en de ondernomen actie worden gearchiveerd conform onze wettelijke bewaarplichten.",
      "Stap 5 — Externe doorstroom: Indien het materiaal niet op Nexora's eigen infrastructuur staat maar via een derde partij wordt aangeboden, wordt de betrokken aanbieder waar mogelijk op de hoogte gesteld.",
    ],
  },
  {
    title: "DMCA — Contre-kennisgeving (Counter-Notice)",
    paragraphs: [
      "Als je van mening bent dat materiaal ten onrechte is verwijderd of uitgeschakeld als gevolg van een onjuiste of misplaatste DMCA-kennisgeving, heb je het recht een contra-kennisgeving (counter-notice) in te dienen. Een geldige contra-kennisgeving dient de volgende elementen te bevatten:",
    ],
    bullets: [
      "1. Jouw naam, adres, telefoonnummer en e-mailadres.",
      "2. Een identificatie van het materiaal dat is verwijderd of waartoe de toegang is geblokkeerd, en de locatie waarop het materiaal verscheen voordat het werd verwijderd.",
      "3. Een verklaring, op straffe van meineed, dat je redelijkerwijs gelooft dat het materiaal is verwijderd als gevolg van een vergissing of onjuiste identificatie.",
      "4. Een verklaring dat je instemt met de bevoegdheid van de bevoegde rechtbank in jouw rechtsgebied (voor EU/Belgische gebruikers: de Belgische rechtbanken).",
      "5. Jouw fysieke of elektronische handtekening.",
    ],
    note: "Na ontvangst van een volledige en geldige contra-kennisgeving sturen wij een kopie naar de oorspronkelijk klagende partij. Het materiaal kan binnen 10 tot 14 werkdagen opnieuw beschikbaar worden gesteld, tenzij de klagende partij een gerechtelijke procedure start.",
  },
  {
    title: "Beleid inzake herhaalde inbreuken",
    paragraphs: [
      "Nexora hanteert een strikt beleid met betrekking tot gebruikers die herhaaldelijk betrokken zijn bij auteursrechtinbreuken. Dit beleid is conform de vereisten van de DMCA en de Europese Digital Services Act.",
      "Bij een eerste gesubstantieerde melding: waarschuwing per e-mail en tijdelijke beperking van toegang tot specifieke functies.",
      "Bij een tweede gesubstantieerde melding: tijdelijke opschorting van het account gedurende een door ons te bepalen periode, gevolgd door herbeoordelingsprocedure.",
      "Bij een derde of verdere gesubstantieerde melding: permanente beëindiging van het account, zonder recht op terugbetaling van eventuele betaalde abonnementskosten.",
      "Nexora behoudt zich tevens het recht voor om bij vermoed ernstig misbruik onmiddellijk en zonder voorafgaande kennisgeving over te gaan tot accountopschorting of -beëindiging, indien de ernst van de inbreuk dit rechtvaardigt.",
    ],
  },
  {
    title: "EU Digital Services Act (DSA) — Naleving",
    paragraphs: [
      "Nexora erkent de verplichtingen die voortvloeien uit Verordening (EU) 2022/2065 — de Digital Services Act (DSA) — die van toepassing is op aanbieders van digitale diensten die actief zijn in de Europese Unie.",
      "Nexora verwerkt kennisgevingen van illegale inhoud zonder onnodige vertraging. Een kennisgeving moet duidelijk de verwijzing naar het betrokken materiaal bevatten, de reden waarom het materiaal als illegaal wordt beschouwd, en de identiteit van de melder.",
      "Gebruikers hebben het recht om bezwaar te maken tegen een beslissing van Nexora om inhoud te beperken of te verwijderen. Bezwaren worden schriftelijk behandeld en beantwoord.",
      "Nexora publiceert, voor zover van toepassing, transparantierapporten over ontvangen kennisgevingen en ondernomen acties, conform de vereisten van de DSA.",
    ],
  },
  {
    title: "Belgische Auteurswet & Naburige Rechten",
    paragraphs: [
      "Voor gebruikers en rechthebbenden in België is de Wet van 19 april 2014 betreffende de auteursrechten en de naburige rechten van toepassing, zoals gecodificeerd in het Wetboek Economisch Recht (WER), Boek XI.",
      "Auteursrechten in België duren in principe 70 jaar na de dood van de auteur. Naburige rechten voor uitvoerende kunstenaars, producenten van fonogrammen en omroepen kennen eigen beschermingstermijnen conform de Europese richtlijnen.",
      "Nexora respecteert de Belgische wetgeving inzake thuiskopie, passend citaatrecht en gebruik voor educatieve doeleinden, maar wijst erop dat deze uitzonderingen beperkt zijn en niet van toepassing zijn op commercieel gebruik of systematische reproductie.",
      "Geschillen omtrent auteursrechten worden in eerste aanleg behandeld door de bevoegde Belgische rechtbanken, tenzij partijen uitdrukkelijk een andere forumkeuze zijn overeengekomen.",
    ],
  },
  {
    title: "Privacybeleid & gegevensverwerking",
    paragraphs: [
      "Nexora verwerkt persoonsgegevens uitsluitend voor de doeleinden die noodzakelijk zijn voor de werking van de dienst. Wij verzamelen nooit meer gegevens dan strikt noodzakelijk (principe van dataminimalisatie conform AVG Art. 5(1)(c)).",
      "De volgende categorieën gegevens worden verwerkt:",
    ],
    bullets: [
      "Kijkgeschiedenis en favorieten — om aanbevelingen te personaliseren en je lijst bij te houden.",
      "Voorkeursinstellingen (kwaliteit, taal, server) — om je ervaring consistent te maken over sessies.",
      "Apparaatinformatie & platformgegevens — voor technische compatibiliteit en foutopsporing.",
      "Anonieme gebruiksstatistieken — voor de verbetering van de dienst, zonder persoonlijk identificeerbare informatie.",
      "IP-adressen (tijdelijk) — voor beveiliging, fraudedetectie en naleving van geo-beperkingen.",
    ],
    note: "Nexora verkoopt, verhuurt of deelt jouw persoonsgegevens niet met derden voor commerciële of marketingdoeleinden.",
  },
  {
    title: "Grondslagen voor verwerking (AVG / GDPR)",
    paragraphs: [
      "De verwerking van persoonsgegevens vindt plaats op basis van de volgende rechtsgrondslagen conform artikel 6 AVG (Verordening (EU) 2016/679):",
    ],
    bullets: [
      "Toestemming (Art. 6(1)(a)) — Voor gepersonaliseerde aanbevelingen en niet-essentiële cookies, mits je toestemming hebt gegeven en te allen tijde in te trekken.",
      "Uitvoering van een overeenkomst (Art. 6(1)(b)) — Voor de kernfunctionaliteiten van de dienst die noodzakelijk zijn om Nexora correct te laten werken.",
      "Gerechtvaardigd belang (Art. 6(1)(f)) — Voor beveiliging, fraudepreventie en dienstverbetering, voor zover jouw belangen niet zwaarder wegen.",
      "Wettelijke verplichting (Art. 6(1)(c)) — Voor zover verwerking noodzakelijk is om te voldoen aan een wettelijke of reglementaire verplichting.",
    ],
  },
  {
    title: "Jouw rechten als betrokkene (AVG)",
    paragraphs: [
      "Als ingezetene van de Europese Economische Ruimte (EER) heb je op grond van de AVG de volgende rechten ten aanzien van jouw persoonsgegevens. Je kunt deze rechten uitoefenen door contact op te nemen via privacy@nexoraapp.com:",
    ],
    bullets: [
      "Recht op inzage (Art. 15) — Je hebt het recht te weten welke persoonsgegevens wij over jou verwerken, voor welke doeleinden en aan wie ze worden verstrekt.",
      "Recht op rectificatie (Art. 16) — Onjuiste of onvolledige gegevens kunnen op jouw verzoek worden gecorrigeerd.",
      "Recht op gegevenswissing / 'recht om vergeten te worden' (Art. 17) — Je kunt verzoeken om verwijdering van jouw persoonsgegevens als de verwerking niet langer noodzakelijk is.",
      "Recht op beperking van de verwerking (Art. 18) — Je kunt verzoeken de verwerking tijdelijk te beperken terwijl een bezwaar of rectificatieverzoek wordt behandeld.",
      "Recht op gegevensoverdraagbaarheid (Art. 20) — Je hebt het recht jouw gegevens in een gestructureerd, gangbaar en machineleesbaar formaat te ontvangen.",
      "Recht van bezwaar (Art. 21) — Je kunt te allen tijde bezwaar maken tegen de verwerking van jouw gegevens op basis van gerechtvaardigd belang.",
      "Recht om klacht in te dienen — Je hebt het recht een klacht in te dienen bij de Belgische Gegevensbeschermingsautoriteit (GBA): www.gegevensbeschermingsautoriteit.be | Drukpersstraat 35, 1000 Brussel.",
    ],
    note: "Op verzoeken wordt doorgaans binnen 30 kalenderdagen gereageerd. In complexe gevallen kan deze termijn met maximaal 2 maanden worden verlengd, met kennisgeving aan jou.",
  },
  {
    title: "Gegevensbeveiliging & bewaartermijnen",
    paragraphs: [
      "Nexora neemt passende technische en organisatorische maatregelen om jouw persoonsgegevens te beschermen tegen verlies, ongeautoriseerde toegang, openbaarmaking of vernietiging. Dit omvat versleuteling van gevoelige gegevens, beperkte toegangsrechten en regelmatige beveiligingsreviews.",
      "Persoonsgegevens worden niet langer bewaard dan nodig voor het doel waarvoor ze zijn verzameld, tenzij een langere bewaartermijn wettelijk verplicht is. Kijkgeschiedenisinformatie wordt bewaard zolang jouw account actief is, tenzij je eerder verwijdering verzoekt via de instellingen.",
      "Bij een datalek dat waarschijnlijk risico's voor jouw rechten en vrijheden inhoudt, zal Nexora de bevoegde toezichthoudende autoriteit binnen 72 uur informeren en jou, indien noodzakelijk, persoonlijk op de hoogte stellen conform Art. 33–34 AVG.",
    ],
  },
  {
    title: "Cookies & trackingtechnologieën",
    paragraphs: [
      "Nexora maakt gebruik van een beperkt aantal cookies en vergelijkbare technologieën, uitsluitend voor functionele en technische doeleinden. Er worden géén tracking cookies voor advertentiedoeleinden gebruikt.",
    ],
    bullets: [
      "Sessie-cookies — Vereist voor de werking van de app en het bijhouden van de aanmeldstatus. Worden verwijderd bij het sluiten van de sessie.",
      "Voorkeurscookies — Slaan jouw instellingen op (taal, kwaliteit, server). Worden bewaard tot je ze wist of het account verwijdert.",
      "Analytische cookies — Nexora gebruikt geanonimiseerde telemetrie om gebruiksproblemen op te sporen. Geen persoonlijk identificeerbare informatie wordt gedeeld met externe partijen.",
    ],
    note: "Nexora deelt geen trackingdata met advertentienetwerken of derde-partij analytische diensten die jouw gedrag over meerdere websites volgen.",
  },
  {
    title: "Leeftijdsgrenzen & geschikt gebruik",
    paragraphs: [
      "Nexora is bedoeld voor gebruikers van 16 jaar en ouder. Minderjarigen tussen 16 en 18 jaar mogen de dienst uitsluitend gebruiken met toestemming en onder verantwoordelijkheid van een ouder of wettelijke voogd.",
      "De Kids-modus in Nexora biedt een gefilterde weergave voor jongere gebruikers, maar vormt geen vervanging voor actief ouderlijk toezicht. Nexora garandeert niet dat alle content in de Kids-modus volledig vrij is van niet-leeftijdsadequaat materiaal, gezien de afhankelijkheid van externe content-ratings van derden.",
      "Ouderlijk toezicht kan worden geactiveerd via de beveiligingsinstellingen van de app middels een 4-cijferige PIN-code. Nexora raadt alle ouders en voogden aan gebruik te maken van deze beschikbare ouderlijk-toezichtopties.",
    ],
  },
  {
    title: "Aanvaardbaar gebruik",
    paragraphs: [
      "Als gebruiker van Nexora verbind je je ertoe de dienst uitsluitend te gebruiken voor persoonlijke, niet-commerciële doeleinden en in overeenstemming met de toepasselijke wetgeving. Het is uitdrukkelijk verboden:",
    ],
    bullets: [
      "De dienst te gebruiken voor het scrapen, automatisch opvragen of massaal downloaden van content, metadata of gebruikersgegevens.",
      "Beveiligingssystemen, toegangscontroles of encryptie te omzeilen of trachten te omzeilen.",
      "Kwaadaardige code, virussen of andere schadelijke software via de dienst te verspreiden.",
      "Andere gebruikers lastig te vallen, te bedreigen of ongepaste inhoud te verspreiden.",
      "Intellectuele eigendomsrechten van Nexora of derden te schenden.",
      "De dienst commercieel te exploiteren zonder uitdrukkelijke schriftelijke toestemming.",
      "Meerdere accounts aan te maken om beperkingen of opschortingen te omzeilen.",
    ],
  },
  {
    title: "Disclaimer & aansprakelijkheidsbeperking",
    paragraphs: [
      "Nexora wordt aangeboden 'zoals het is' (as-is) en 'zoals het beschikbaar is' (as-available), zonder enige garantie van welke aard dan ook, expliciet dan wel impliciet, waaronder begrepen maar niet beperkt tot garanties van verkoopbaarheid, geschiktheid voor een bepaald doel of niet-inbreuk.",
      "Nexora is niet aansprakelijk voor de juistheid, volledigheid of rechtmatigheid van de via externe aanbieders beschikbaar gestelde content. De verantwoordelijkheid voor de aangeboden content berust uitsluitend bij de betreffende externe platforms en aanbieders.",
      "Nexora aanvaardt geen aansprakelijkheid voor directe, indirecte, incidentele, bijzondere of gevolgschade die voortvloeit uit het gebruik of het niet kunnen gebruiken van de dienst, zelfs indien Nexora op de hoogte is gesteld van de mogelijkheid van dergelijke schade.",
      "In rechtsgebieden waar uitsluiting van aansprakelijkheid niet volledig is toegestaan, is de aansprakelijkheid van Nexora beperkt tot het maximaal door toepasselijk recht toegestane minimum.",
    ],
  },
  {
    title: "Wijzigingen aan dit beleid",
    paragraphs: [
      "Nexora behoudt zich het recht voor dit juridisch beleid en alle aanverwante documenten op elk moment te wijzigen. Wezenlijke wijzigingen worden kenbaar gemaakt via een melding in de applicatie ten minste 14 dagen voor de ingangsdatum, tenzij spoedeisende omstandigheden een kortere termijn vereisen.",
      "De meest recente versie van dit beleid is altijd beschikbaar via het 'Juridisch & DMCA'-gedeelte in de app. Voortgezet gebruik van de dienst na de ingangsdatum van een herziene versie wordt beschouwd als aanvaarding van de gewijzigde voorwaarden.",
      "De huidige versie van dit beleid is van kracht per 16 april 2026.",
    ],
  },
  {
    title: "Toepasselijk recht & bevoegde rechtbank",
    paragraphs: [
      "Op alle rechtsverhoudingen tussen Nexora en haar gebruikers is het Belgische recht van toepassing, tenzij dwingend recht in het land van verblijf van de gebruiker anders bepaalt.",
      "Geschillen die niet in der minne kunnen worden geschikt, worden exclusief voorgelegd aan de bevoegde rechtbanken van het gerechtelijk arrondissement Antwerpen, tenzij de consumenten- of privacywetgeving de gebruiker het recht geeft het geschil voor te leggen aan de rechter van zijn woonplaats.",
      "Het recht van de gebruiker om een klacht in te dienen bij de Belgische Gegevensbeschermingsautoriteit (GBA) of een andere bevoegde toezichthoudende autoriteit blijft te allen tijde onverminderd van kracht.",
    ],
  },
  {
    title: "Contactgegevens",
    paragraphs: [
      "Voor alle juridische vragen, DMCA-kennisgevingen, privacyverzoeken of andere officiële communicatie kun je Nexora bereiken via de volgende kanalen:",
    ],
    bullets: [
      "E-mail (DMCA & juridische meldingen): legal@nexoraapp.com",
      "E-mail (privacy & AVG-verzoeken): privacy@nexoraapp.com",
      "E-mail (algemene ondersteuning): support@nexoraapp.com",
      "Postadres: Nexora — t.a.v. Legal Department, Antwerpen, België",
      "Reactietijd: juridische vragen binnen 5 werkdagen; AVG-verzoeken binnen 30 kalenderdagen.",
    ],
    note: "Nexora verzoekt uitdrukkelijk om uitsluitend via de officiële e-mailkanalen contact op te nemen voor juridische aangelegenheden. Verzoeken via sociale media, commentaarsecties of andere informele kanalen worden niet als formele kennisgeving beschouwd en leiden niet tot enige verplichting.",
  },
];

export default function LegalScreen() {
  return (
    <View style={styles.screen}>
      <NexoraSimpleHeader title="Juridisch & DMCA" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introBox}>
          <Text style={styles.introText}>
            {"Versie 2.0 — Ingangsdatum: 16 april 2026\nNexora is geregistreerd in België en opereert conform Belgisch recht en Europese regelgeving."}
          </Text>
        </View>

        {LEGAL_SECTIONS.map((section, idx) => (
          <View key={idx} style={styles.card}>
            {section.intro ? (
              <Text style={styles.sectionIntro}>{section.intro}</Text>
            ) : null}
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((para, pIdx) => (
              <Text key={pIdx} style={styles.body}>{para}</Text>
            ))}
            {section.bullets ? (
              <View style={styles.bulletList}>
                {section.bullets.map((bullet, bIdx) => (
                  <View key={bIdx} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {section.note ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>{section.note}</Text>
              </View>
            ) : null}
          </View>
        ))}

        <Text style={styles.footer}>
          {"© 2026 Nexora. Alle rechten voorbehouden.\nDit document is uitsluitend informatief van aard en vormt geen juridisch advies."}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
  },
  content: {
    paddingBottom: 40,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  introBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: "rgba(229,9,20,0.06)",
    padding: 12,
    marginBottom: 4,
  },
  introText: {
    color: P.muted,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: P.border,
    backgroundColor: P.card,
    padding: 16,
    gap: 10,
  },
  sectionIntro: {
    color: P.accent,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontFamily: "Inter_700Bold",
    opacity: 0.7,
  },
  sectionTitle: {
    color: P.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  body: {
    color: P.muted,
    fontSize: 13,
    lineHeight: 21,
    fontFamily: "Inter_400Regular",
  },
  bulletList: {
    gap: 8,
    marginTop: 2,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: P.accent,
    marginTop: 7,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    color: P.muted,
    fontSize: 12,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  noteBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.25)",
    backgroundColor: "rgba(229,9,20,0.05)",
    padding: 10,
    marginTop: 2,
  },
  noteText: {
    color: "#ff6b6b",
    fontSize: 11,
    lineHeight: 17,
    fontFamily: "Inter_500Medium",
  },
  footer: {
    color: "rgba(160,160,174,0.5)",
    fontSize: 10,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },
});
