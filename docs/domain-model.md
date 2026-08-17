# Bytor Hockey Data — model domenowy

## Cel dokumentu

Ten dokument opisuje podstawowy model domenowy repozytorium `bytor-hockey-data`, najważniejsze decyzje architektoniczne oraz reguły dotyczące jakości i pochodzenia danych.

Jest to dokument referencyjny dla:

- dalszego rozwoju schematu,
- importerów i scraperów,
- walidacji danych,
- przyszłych narzędzi AI,
- integracji z aplikacją Bytor Hockey.

Model opisany poniżej stanowi zakończenie **Phase 1 — Core Data Foundation**.

---

# 1. Główne zasady

## 1.1. Raw data i canonical data to dwie różne rzeczy

Dane pobrane ze źródeł zewnętrznych są przechowywane jako snapshoty w:

```text
imports/
```

Nie poprawiamy ich ręcznie.

Jeżeli źródło zawiera literówkę, starą nazwę, błędny adres lub brakującą informację, raw snapshot powinien nadal odzwierciedlać to, co faktycznie zwróciło źródło.

Oczyszczone i znormalizowane dane trafiają do:

```text
data/
```

To właśnie `data/` jest canonical database projektu Bytor.

---

## 1.2. Canonical ID nie jest ID źródła zewnętrznego

Każda encja posiada stabilne ID Bytora, np.:

```text
cambridge-narwhals
milton-keynes
buiha
```

Identyfikatory pochodzące z zewnętrznych systemów przechowujemy osobno:

```yaml
externalIds:
  - system: eiharec
    value: "213"
```

Dzięki temu jedna encja może później posiadać identyfikatory z wielu systemów.

---

## 1.3. Unknown jest lepsze niż zgadywanie

Jeżeli informacji nie znamy, zapisujemy brak danych albo `unknown`.

Nie zakładamy faktów tylko dlatego, że wydają się prawdopodobne.

Dotyczy to szczególnie:

- statusu drużyny,
- poziomu sportowego,
- kategorii,
- historii klubu,
- przypisania do organizacji,
- ciągłości pomiędzy dawną i obecną nazwą.

---

## 1.4. AI nie jest źródłem prawdy

AI może:

- wyszukiwać potencjalne encje,
- analizować źródła,
- sugerować powiązania,
- wykrywać konflikty,
- proponować zmiany,
- pomagać w porządkowaniu danych.

AI nie powinno samodzielnie zamieniać niepewnej informacji w canonical fact.

---

# 2. Główne encje

Aktualny core model składa się z:

```text
Source
Organisation
Rink
Team
Competition
CompetitionSeason
TeamParticipation
```

---

# 3. Source

`Source` reprezentuje zewnętrzne źródło informacji.

Przykłady:

```text
eiharec
buiha
```

Źródłem może być między innymi:

- oficjalna strona,
- registry,
- strona ligi,
- strona drużyny,
- Facebook,
- Instagram,
- PDF,
- baza danych,
- materiał ręcznie zebrany.

Encje odwołują się do źródeł przez:

```yaml
sourceIds:
  - eiharec
```

Jeżeli posiadamy dokładny URL dotyczący konkretnej encji, może on zostać zachowany również jako `sourceUrls`.

---

# 4. Organisation

`Organisation` reprezentuje podmiot organizacyjny.

Może to być między innymi:

- governing body,
- league operator,
- club,
- programme,
- team operator,
- event organiser,
- rink operator.

Przykłady:

```text
BUIHA
MK Storm
Manchester Metros
```

Organisation nie musi sama występować w meczach.

---

# 5. Team

`Team` oznacza konkretną jednostkę sportową, która może wystąpić w meczu lub rozgrywkach.

To bardzo ważne rozróżnienie.

Przykład:

```text
Organisation:
MK Storm

Teams:
MK Storm U10
MK Storm U12
MK Storm U14
MK Storm U16
MK Storm U19
```

Analogicznie:

```text
Organisation:
Manchester Metros

Teams:
Manchester Metros A
Manchester Metros B
Manchester Metros C
```

Drużyna może wskazywać swoją organizację przez:

```yaml
organisationId: mk-storm
```

Pole jest opcjonalne, ponieważ część independent lub recreational teams może nie mieć jeszcze zidentyfikowanej organizacji nadrzędnej.

---

# 6. Team role

`Team.role` opisuje funkcję drużyny w ramach większej struktury.

Aktualne wartości:

```text
primary
age_group
development
reserve
academy
recreational
other
unknown
```

Przykłady:

```text
MK Storm U16
→ age_group

Cambridge Narwhals
→ recreational
```

Jeżeli rola nie jest jednoznaczna, używamy `unknown`.

---

# 7. Rink

`Rink` reprezentuje fizyczne lodowisko lub obiekt.

Drużyny wskazują lodowiska przez canonical `rinkIds`.

Przykład:

```yaml
rinkIds:
  - cambridge
```

Nie wykorzystujemy zewnętrznego ID lodowiska bezpośrednio jako relacji.

Importer najpierw rozwiązuje:

```text
eiharec:65
```

do canonical rink ID.

---

# 8. Competition

`Competition` reprezentuje trwałą tożsamość rozgrywek.

Przykłady:

```text
BUIHA Non-Checking Division 1 North
NIHL Division 2 South
U16 South Division
```

Competition nie reprezentuje konkretnego sezonu.

---

# 9. CompetitionSeason

`CompetitionSeason` reprezentuje konkretną edycję Competition.

Przykład:

```text
Competition:
BUIHA Non-Checking Division 1 North

CompetitionSeason:
BUIHA Non-Checking Division 1 North 2025/26
```

Season może obejmować jeden lub dwa lata.

Przykład:

```yaml
season:
  startYear: 2025
  endYear: 2026
  label: "2025/26"
```

Status sezonu posiada własny lifecycle:

```text
upcoming
active
completed
cancelled
unknown
```

---

# 10. TeamParticipation

Relacja pomiędzy Team i CompetitionSeason nie jest przechowywana jako lista `teamIds` w sezonie.

Zamiast tego istnieje osobna encja:

```text
TeamParticipation
```

Model:

```text
Team
  ↓
TeamParticipation
  ↓
CompetitionSeason
  ↓
Competition
```

Przykład:

```text
Manchester Metros B
  ↓
uczestniczy w
  ↓
BUIHA Non-Checking Division 1 North 2025/26
```

Dzięki osobnej encji uczestnictwo może później posiadać własne dane, np.:

- status,
- źródła,
- display name,
- seed,
- pozycję końcową,
- grupę,
- informację o wycofaniu.

Aktualne statusy uczestnictwa:

```text
confirmed
active
completed
withdrawn
disqualified
unknown
```

---

# 11. Relacje między encjami

Podstawowy model wygląda następująco:

```text
Organisation
      ↑
      │ organisationId
      │
Team
      │
      ├────────────→ Rink
      │
      ↓
TeamParticipation
      ↓
CompetitionSeason
      ↓
Competition
```

Source może być przypisane do większości encji jako provenance.

---

# 12. Aliases i historical names

Każda nazwana encja może posiadać:

```text
name
aliases
historicalNames
```

## Alias

Alias oznacza alternatywną nazwę tej samej encji.

Przykłady:

```text
British Universities Ice Hockey Association
BUIHA
```

## Historical name

Historical name oznacza rzeczywistą dawną nazwę tej samej encji.

Może zawierać przedział czasu:

```yaml
historicalNames:
  - name: Old Club Name
    until:
      year: 2018
```

Zmiana nazwy nie powoduje automatycznej zmiany canonical ID.

---

# 13. Entity identity

Podobne lub identyczne nazwy nie oznaczają automatycznie tej samej encji.

Przed utworzeniem nowego rekordu należy sprawdzić:

- canonical name,
- aliases,
- historical names,
- external IDs,
- organisation,
- rink,
- lokalizację,
- źródła,
- okres działalności.

System posiada deterministyczną normalizację nazw służącą do wyszukiwania potencjalnych dopasowań.

Normalizacja jest pomocą przy entity resolution, a nie automatycznym dowodem tożsamości.

Przykład:

```text
0 matches
→ możliwa nowa encja

1 match
→ należy sprawdzić istniejącą encję

2+ matches
→ przypadek niejednoznaczny, brak automatycznej decyzji
```

---

# 14. Walidacja

`pnpm validate` odpowiada za poprawność strukturalną bazy.

Aktualnie sprawdza między innymi:

- zgodność YAML z Zod schemas,
- Team → Rink,
- Team → Organisation,
- entity → Source,
- Competition → Organisation,
- CompetitionSeason → Competition,
- TeamParticipation → Team,
- TeamParticipation → CompetitionSeason,
- provenance historical names,
- unikalność external IDs.

Błędy integrity powinny blokować zmianę danych.

---

# 15. Data audit

`pnpm data-audit` jest czymś innym niż validation.

Validation odpowiada na pytanie:

> Czy baza jest poprawna?

Audit odpowiada na pytanie:

> Jak kompletne i dobre są dane?

Audit może raportować między innymi:

- brakujące strony,
- brakujące logotypy,
- brakujące rinki,
- brakujące coordinates,
- brakujące organisations,
- rozkład team roles,
- niejednoznaczne nazwy.

Brak danych w audycie nie musi być błędem.

---

# 16. Importery

Importery powinny być:

- deterministyczne,
- idempotentne,
- odporne na ponowne uruchomienie,
- oparte na external IDs,
- pozbawione zgadywania.

Import nie powinien automatycznie nadpisywać ręcznie zweryfikowanej canonical data.

Raw source powinien zostać zachowany osobno.

---

# 17. Obecne dane

Pierwszym dużym źródłem danych jest EIHA Recreational Ice Hockey.

Aktualna baza zawiera między innymi:

- EIHA Rec teams,
- EIHA Rec rinks,
- relacje team → rink,
- EIHA Rec external IDs,
- training information,
- dostępne strony/social media,
- dostępne dane kontaktowe,
- logotypy,
- source provenance.

Techniczne placeholdery występujące w EIHA Rec nie są importowane jako Team entities.

---

# 18. Dane, których jeszcze nie modelujemy

Core model świadomie nie zawiera jeszcze:

```text
Player
Coach
Roster
Game
Fixture
Score
Standing
Event
EventEdition
Tournament bracket
```

Te elementy będą dodawane dopiero wtedy, gdy pojawią się realne wymagania danych.

Nie rozszerzamy modelu wyłącznie „na zapas”.

---

# 19. Stabilne decyzje architektoniczne

Poniższe zasady traktujemy obecnie jako podstawowy kontrakt projektu:

```text
raw imports ≠ canonical data

canonical IDs ≠ external IDs

Organisation ≠ Team

Competition ≠ CompetitionSeason

Team ≠ TeamParticipation

unknown > guess

AI ≠ source of truth

provenance stays with data

relations use canonical IDs

external systems are resolved through externalIds
```

---

# 20. Status

**Phase 1 — Core Data Foundation: complete.**

Następna faza projektu obejmuje modelowanie i import oficjalnej struktury hokeja w Anglii:

- senior hockey,
- junior hockey,
- women's hockey,
- competitions,
- seasons,
- clubs,
- age-group teams,
- participation.
