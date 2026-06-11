/** Ratified canonical institutional tiers (Jason 2026-06-11), per source-credibility-model.
 *  Single source of truth for Phase 0' apply + the tier sheet. Institution key = eTLD+1 (with
 *  europa.eu / gov.uk / US-state subdomain exceptions). T1-2 PASS the CRITICAL/HIGH authority floor;
 *  T3+ FAIL. Class societies (LR/DNV/ClassNK/BV)=T4 PRECEDENT: delegated authority attaches to their
 *  official acts (statutory surveys/certificates), not their websites; the grounding spans are client
 *  briefings = industry-body publishing -> usable as labeled "Industry interpretation:" ANALYSIS, not
 *  unlabeled FACT-grade for CRITICAL/HIGH regs. Same ruling recurs for EU MRV / CBAM accredited verifiers. */
export const MAP = {
  // T1 — primary legal text / legislatures / official legal publishers
  "eur-lex.europa.eu":1,"legislation.gov.uk":1,"texas.gov":1,"ncleg.gov":1,"ksrevisor.gov":1,"ms.gov":1,
  "oah.nc.gov":1,"planalto.gov.br":1,"montreal.ca":1,"phila.gov":1,"energystar.gov":1,"dmv.ca.gov":1,"ecfr.gov":1,"federalregister.gov":1,
  // T2 — regulators / government agencies / official records
  "ec.europa.eu":2,"commission.europa.eu":2,"europarl.europa.eu":2,"emsa.europa.eu":2,"epa.gov":2,"epa.ie":2,
  "nyc.gov":2,"imo.org":2,"icao.int":2,"parliament.uk":2,"sdir.no":2,"regjeringen.no":2,"customs.go.jp":2,"mof.go.jp":2,"meti.go.jp":2,"mlit.go.jp":2,
  "portal.ct.gov":2,"ct.gov":2,"gov.uk":2,"business.gov.uk":2,"pib.gov.in":2,"gao.gov":2,"energy.gov":2,"dot.gov":2,"dot.ny.gov":2,"ncdot.gov":2,
  "vic.gov.au":2,"njeda.gov":2,"dehst.de":2,"cssf.lu":2,"osc.ny.gov":2,"governor.nc.gov":2,"state.tx.us":2,"lancaster.gov.uk":2,"trade.gov":2,
  "www.gov.cn":2,"portoflosangeles.org":2,"cleanairactionplan.org":2,"dot.ca.gov":2,"arb.ca.gov":2,"canada.ca":2,"gov.br":2,"gov.pl":2,"ks.gov":2,
  "nabers.gov.au":2,"oregon.gov":2,"nm.gov":2,"wa.gov":2,"energy.ca.gov":2,
  // T3 — intergovernmental analysis + academic/research + gov statistical
  "icapcarbonaction.com":3,"iea.org":3,"eia.gov":3,"worldbank.org":3,"oecd.org":3,"itf-oecd.org":3,"wto.org":3,"unctad.org":3,
  "weforum.org":3,"iadb.org":3,"asean.org":3,"ipcc.ch":3,"cepal.org":3,"un.org":3,"ilo.org":3,"cciced.eco":3,"mission-innovation.net":3,
  "unesco.org":3,"bls.gov":3,"ers.usda.gov":3,"nih.gov":3,"stlouisfed.org":3,"cranfield.ac.uk":3,"sei.org":3,"csrf.ac.uk":3,"tyndall.ac.uk":3,
  "wri.org":3,"erim.eur.nl":3,"sustainable.mit.edu":3,"mit.edu":3,"nlr.gov":2,"iml.fraunhofer.de":3,"tandfonline.com":3,"nature.com":3,"sciencedirect.com":3,"arxiv.org":3,"link.springer.com":3,"nationalacademies.org":3,
  // T4 — industry / trade / standards / classification bodies
  "lr.org":4,"dnv.com":4,"classnk.or.jp":4,"bureauveritas.com":4,"bimco.org":4,"clecat.org":4,"aecc.eu":4,"espo.be":4,
  "iso.org":4,"iata.org":4,"rvia.org":4,"advancedenergy.org":4,"clean-trucking.eu":4,"theicct.org":4,"carbontrust.com":4,"ghgprotocol.org":4,
  "transportpolicy.net":4,"tuv.com":4,"smartfreightcentre.org":4,"usgbc.org":4,"dromon.com":4,"globalmaritimeforum.org":4,"sustainablepackaging.org":4,
  // T5 — trade press / news
  "dieselnet.com":5,"sustainable-bus.com":5,"truckinginfo.com":5,"maritime-executive.com":5,"freightcourse.com":5,"logisticsinsider.in":5,
  "logishift.net":5,"chiefengineerlog.com":5,"newyorktruckingonline.com":5,"intertek.com":5,"supplychaindigital.com":5,"theartnewspaper.com":5,
  "wikipedia.org":5,"ammoniaenergy.org":5,"packagingeurope.com":5,
  // T6 — analysis / advisory / law firm / NGO / commercial
  "wfw.com":6,"lw.com":6,"allbrightlaw.com":6,"klalaw.com.br":6,"nortonrosefulbright.com":6,"reedsmith.com":6,"dlapiper.com":6,"kpmg-law.de":6,
  "debrauw.com":6,"pwc.com":6,"deloitte.com":6,"amundi.com":6,"mckinsey.com":6,"natlawreview.com":6,"legalclarity.org":6,"chambers.com":6,
  "fenechlaw.com":6,"coolset.com":6,"planbe.eco":6,"complymarket.com":6,"carboneer.earth":6,"senken.io":6,"shipzero.com":6,"cim.io":6,
  "climatecatalyst.org":6,"clientearth.asia":6,"igsd.org":6,"envigilance.com":6,"sustainable-ships.org":6,"heavyvehicleinspection.com":6,
  "epcadvisor.co.uk":6,"easyepc.org":6,"home-energy-model.co.uk":6,"britanniapandi.com":6,"skuld.com":6,"reach24h.com":6,"normecverifavia.com":6,
  "customtruck.com":6,"qtagg.com":6,"enpg.com":6,"carbon-direct.com":6,"climatepartner.com":6,"ups.com":6,"searoutes.com":6,"accelerator.nyc":6,
  "futureforwarding.com":6,"varuna-sentinels.com":6,"ecosistant.eu":6,"investbangladesh.co":6,"impactbuying.com":6,"dockflow.com":6,"cfp.energy":6,
  "govtech.com":6,"simplybusiness.co.uk":6,"onewaybit.com":6,"lindnerlogistics.com":6,"feedlegislation.org":6,"nautilusint.org":6,"maloneyaffordable.com":6,"promiseenergy.com":6,
  // ── inconsistent-tier institutions curated in Phase 0' (all reg=0 / non-flip; for invariant-green + honesty) ──
  // gov / regulators (T2)
  "mpa.gov.sg":2,"gov.ae":2,"driveelectric.gov":2,"nashville.gov":2,"clarkcountynv.gov":2,"umweltbundesamt.de":2,
  "consilium.europa.eu":2,"gnb.ca":2,"nj.gov":2,"service.gov.uk":2,"la.gov":2,"mass.gov":2,"mintransporte.gov.co":2,
  "transportation.gov":2,"boston.gov":2,"lacity.gov":2,"sd.gov":2,
  // intergovernmental analysis + academic/research (T3)
  "clean-hydrogen.europa.eu":3,"fraunhofer.de":3,"eur.nl":3,"cec.org":3,"eea.europa.eu":3,"thegef.org":3,"imf.org":3,
  // industry / trade / standards / think-tank (T4)
  "rmi.org":4,"thedecarbhub.org":4,"shipzemba.org":4,"iisd.org":4,"aspeninstitute.org":4,"breeam.com":4,
  // trade press (T5)
  "freightwaves.com":5,"joc.com":5,"thomsonreuters.com":5,"maritimecarbonintelligence.com":5,
  // commercial entities (T6)
  "dpworld.com":6,"yara.com":6,
  // ── inconsistent registered hosts that ground few/no claims (invariant-green; non-flip) ──
  // US state / territory / agency gov + AU states + CA provinces + KR/CN ministries (T2)
  "mo.gov":2,"coloradosos.gov":2,"hawaii.gov":2,"in.gov":2,"dc.gov":2,"utah.gov":2,"georgia.gov":2,"maine.gov":2,
  "mt.gov":2,"wisconsin.gov":2,"nd.gov":2,"tn.gov":2,"maryland.gov":2,"illinois.gov":2,"ky.gov":2,"virginia.gov":2,
  "iowa.gov":2,"delaware.gov":2,"mn.gov":2,"pa.gov":2,"alaska.gov":2,"deq.nc.gov":2,"tas.gov.au":2,"nsw.gov.au":2,
  "nu.ca":2,"mof.go.kr":2,"mee.gov.cn":2,"nrel.gov":2,
  // intergovernmental / research (T3)
  "irena.org":3,"tno.nl":3,"columbia.edu":3,
  // industry / trade / think-tank (T4)
  "iru.org":4,"iaphworldports.org":4,"climate-laws.org":4,"lrfoundation.org.uk":4,"ellenmacarthurfoundation.org":4,
  // NGO/coalition (T6)
  "galleryclimatecoalition.org":6,
};
