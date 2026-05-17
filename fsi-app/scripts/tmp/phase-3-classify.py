import json, sys, re

with open('scripts/tmp/phase-3-jurisdiction-introspect.json', encoding='utf-8') as f:
    d = json.load(f)

all_jur = d['jurisdictions_distinct']

ISO_3166_1 = re.compile(r'^[A-Z]{2}$')
ISO_3166_2 = re.compile(r'^[A-Z]{2}-[A-Z0-9]{1,3}$')
KNOWN_FREE_TEXT = {'EU', 'GLOBAL', 'IMO', 'ICAO'}

MIGRATION_072_KEYS = {
    'us','usa','united states','united states of america',
    'eu','european union','eu-27',
    'uk','united kingdom','great britain',
    'global','international','worldwide',
    'singapore','hong kong','japan','south korea','korea',
    'china','china (prc)','prc','canada','australia','imo','icao',
    'germany','france','italy','spain','netherlands','belgium','switzerland',
    'sweden','norway','denmark','finland','ireland','portugal','austria','poland',
    'india','brazil','mexico','argentina','chile','colombia','peru','south africa',
    'united arab emirates','uae','saudi arabia','turkey','indonesia','thailand',
    'vietnam','malaysia','philippines','new zealand','lithuania','iran','kenya',
    'croatia','puerto rico',
    'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
    'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
    'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
    'minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire',
    'new jersey','new mexico','new york','north carolina','north dakota','ohio',
    'oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota',
    'tennessee','texas','utah','vermont','virginia','washington','washington state',
    'west virginia','wisconsin','wyoming',
    'england','scotland','wales','northern ireland','northern_ireland'
}

buckets = {
    'iso_3166_1_canonical': [],
    'iso_3166_2_canonical': [],
    'known_free_text': [],
    'us_subnational_non_iso': [],
    'mapped_by_trigger_case': [],
    'us_federal_variant': [],
    'state_name_uppercased': [],
    'subnational_county_city': [],
    'region_bucket': [],
    'continent': [],
    'agency_or_org_name': [],
    'hydrological_or_natural_feature': [],
    'ambiguous_or_org_group': [],
    'other_unmapped': [],
}

def classify(value):
    v = value.strip()
    vl = v.lower()
    if v in KNOWN_FREE_TEXT:
        return 'known_free_text'
    if ISO_3166_1.match(v):
        return 'iso_3166_1_canonical'
    if ISO_3166_2.match(v):
        if v in {'US-NYC','US-LAX'}:
            return 'us_subnational_non_iso'
        return 'iso_3166_2_canonical'
    if vl in MIGRATION_072_KEYS:
        return 'mapped_by_trigger_case'
    if v in {'FEDERAL','UNITED_STATES','US_FEDERAL','UNITED STATES FEDERAL','UNITED STATES - FEDERAL'}:
        return 'us_federal_variant'
    if 'STATE' in v.upper() and v != 'UNITED STATES':
        return 'state_name_uppercased'
    if v in {'NEW YORK CITY','NEW_YORK_CITY','LOS ANGELES','SAN FRANCISCO','SAN_FRANCISCO','BAY ST. LOUIS','BOSTON','BERKELEY','SAN DIEGO','RENO','LAS VEGAS','OAKLAND','NEW YORK','BROOKLYN','MANHATTAN','NEWARK','PHILADELPHIA','BALTIMORE','MIAMI','HOUSTON','DALLAS','CHICAGO','SEATTLE','SAN ANTONIO','PORTLAND','ATLANTA','DETROIT','MEMPHIS','PITTSBURGH','ALBUQUERQUE','TUCSON','PHOENIX','SACRAMENTO','SAN JOSE','RICHMOND','BUFFALO','ROCHESTER','BIHOR COUNTY','ONTARIO','QUEBEC','LONDON','PARIS','BERLIN','MUNICH','BARCELONA','MILAN','HAMBURG','VANCOUVER','TORONTO','MONTREAL','SHANGHAI','BEIJING','TOKYO','OSAKA','SEOUL','MUMBAI','DELHI','SAO PAULO','RIO DE JANEIRO','BUENOS AIRES','MEXICO CITY','DUBAI','ABU DHABI','RIYADH','JOHANNESBURG','CAPE TOWN','SYDNEY','MELBOURNE','BRISBANE','AUCKLAND','WELLINGTON'}:
        return 'subnational_county_city'
    if v in {'ASIA','EUROPE','AFRICA','OCEANIA','NORTH AMERICA','SOUTH AMERICA','ANTARCTICA'}:
        return 'continent'
    if v in {'LATAM','LATIN AMERICA','LATIN_AMERICA','MEAF','MIDDLE EAST','MIDDLE EAST AND AFRICA','NORTH_AMERICA','SOUTH_AMERICA','ASIA PACIFIC','ASIA_PACIFIC','ASIA-PACIFIC','APAC','EMEA','EMEAS','ANZ','PACIFIC RIM','SUBSAHARAN AFRICA','EASTERN EUROPE','WESTERN EUROPE','CENTRAL ASIA','SOUTHEAST ASIA','SOUTH ASIA','EAST ASIA','MENA','NORDIC','BALKANS'}:
        return 'region_bucket'
    if v in {'DEVELOPING_COUNTRIES','DEVELOPING COUNTRIES','ASIAN_DEVELOPMENT_BANK_MEMBERS','ASIAN DEVELOPMENT BANK MEMBERS','OECD','OECD_MEMBER_STATES','OECD MEMBER STATES','EASA_MEMBER_STATES','EASA MEMBER STATES','G7','G20','BRICS','UN_MEMBER_STATES','EU_MEMBER_STATES','EU MEMBER STATES','BALTIC_REGION','BALTIC REGION','NORTHEAST_REGION','NORTHEAST REGION','MERCOSUR','ASEAN','COMMONWEALTH','EEA','EUROPEAN_UNION'}:
        return 'ambiguous_or_org_group'
    if any(s in v.upper() for s in ['WATERSHED','RIVER','BASIN','LAKE','GULF','SEA',' STRAIT','OCEAN','PORT OF','HARBOR','HARBOUR','VALLEY','MOUNTAIN','FJORD','DELTA']):
        return 'hydrological_or_natural_feature'
    if any(s in v.upper() for s in ['MINISTRY','AUTHORITY','AGENCY','COMMISSION','DEPARTMENT','OFFICE OF','PARLIAMENT','DOB','EPA','CARB','NMA','SDIR','CCC','UNFCCC','UNCTAD','MARITIME','AVIATION ADMINISTRATION','SENATE','HOUSE OF','GOV.','CONGRESS','COUNCIL','COURT','REGULATOR','BUREAU','BOARD','ASSEMBLY']):
        return 'agency_or_org_name'
    return 'other_unmapped'

for r in all_jur:
    bucket = classify(r['value'])
    buckets[bucket].append((r['value'], int(r['n'])))

total_distinct = sum(len(v) for v in buckets.values())
total_occurrences = sum(n for v in buckets.values() for _, n in v)
print(f'Total distinct: {total_distinct}')
print(f'Total occurrences: {total_occurrences}')
print()

# Summary table
print('CLASSIFICATION SUMMARY:')
for name in ['iso_3166_1_canonical','iso_3166_2_canonical','known_free_text','us_subnational_non_iso','mapped_by_trigger_case','us_federal_variant','state_name_uppercased','subnational_county_city','region_bucket','continent','agency_or_org_name','hydrological_or_natural_feature','ambiguous_or_org_group','other_unmapped']:
    items = buckets[name]
    total = sum(n for _, n in items)
    print(f'  {name:42s} {len(items):>4} distinct  {total:>5} occurrences')
print()

# Per-bucket details
for name in ['us_federal_variant','state_name_uppercased','subnational_county_city','region_bucket','continent','agency_or_org_name','hydrological_or_natural_feature','ambiguous_or_org_group','other_unmapped']:
    items = buckets[name]
    if not items: continue
    total = sum(n for _, n in items)
    print(f'== {name}: {len(items)} distinct, {total} occurrences ==')
    for v, n in sorted(items, key=lambda x: -x[1])[:60]:
        print(f'    {v[:60]:62s} {n:>4}')
    if len(items) > 60:
        print(f'    ... and {len(items)-60} more')
    print()

# Dump 'other_unmapped' in full as JSON for the dispatch doc
with open('scripts/tmp/phase-3-classified.json', 'w', encoding='utf-8') as f:
    json.dump({k: v for k, v in buckets.items()}, f, indent=2, ensure_ascii=False)
print('Full classification written to scripts/tmp/phase-3-classified.json')
