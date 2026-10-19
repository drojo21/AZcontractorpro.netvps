/**
 * Trade knowledge base.
 *
 * Merged from three places that each held a partial copy: the TRADES table in
 * builder.html, references/trade_defaults.md in the contractor-marketing-
 * deliverables skill, and getTradeServices()/getTradeColors() in
 * payment-server.js. Those three disagreed with each other, so this file is
 * now the single source and the others read from it.
 *
 * The `az` block on each trade is the part that is hard to fake: the things a
 * contractor in Arizona deals with that one in Ohio does not. Copy, FAQs and
 * service-page bodies are all built from it, which is what keeps generated
 * sites from reading like the same template with the city swapped.
 */

/** Shared Arizona context, true regardless of trade. */
export const AZ = {
  monsoon: { label: "monsoon season", months: "mid-June through September" },
  heat: { label: "summer heat", months: "May through September", designTemp: "110-115°F" },
  soil: "caliche and expansive clay",
  water: "some of the hardest municipal water in the country",
  // Tucson (TEP) and metro Phoenix (APS/SRP) are different utilities with
  // different rebate programs. Used for electrical/HVAC copy.
  utilities: { tucson: "TEP", phoenix: "APS and SRP" }
};

const T = {
  masonry: {
    label: "Masonry",
    gbp: ["Masonry Contractor", "Concrete Contractor"],
    rocClasses: ["CR-31", "KB-1", "KB-2", "A"],
    palette: { primary: "#78350F", accent: "#D97706" },
    fonts: { display: "Oswald", body: "Lato" },
    services: [
      ["Block Walls & Fences", "CMU block walls built on a proper footing, with the rebar and grout the code calls for."],
      ["Block Wall Repair", "Cracked, leaning or storm-damaged walls rebuilt, with mortar color matched to what is already there."],
      ["Retaining Walls", "Engineered retaining walls that hold a grade change and drain instead of bowing out."],
      ["Stucco & Stone Veneer", "Stucco over block and natural or manufactured stone veneer, scratch coat through finish."],
      ["Brick & Paver Work", "Paver patios, driveways and walkways set on a compacted base so they stay flat."],
      ["Outdoor Living", "BBQ islands, fire pits, seat walls and ramada bases built to match the house."]
    ],
    az: {
      concerns: [
        "Caliche makes footing excavation slow. We price the dig honestly instead of discovering it on day two.",
        "Hot-weather masonry has rules. Above about 100°F mortar has to be handled differently or the bond suffers, so summer work starts early.",
        "Monsoon winds find walls that were built without the right rebar and grout spacing. That is most of the repair work we get called for.",
        "Hard water leaves efflorescence, the white bloom on block. We can treat it and explain what actually stops it coming back."
      ],
      faqs: [
        ["Why do block walls crack in Arizona?", "Most of the time it is the footing, not the block. Caliche and expansive clay move, and a footing that is too shallow or has no rebar moves with them. We look at the crack pattern first, because that tells us whether it is settlement, a missing control joint, or something that only needs tuckpointing."],
        ["Can you match the mortar on my existing wall?", "Yes. Mortar color shifts as it ages, so we match to the wall as it looks now rather than to a bag color. On a visible repair we mix a sample, let it cure, and check it in daylight before we do the whole section."],
        ["How long does a block wall take?", "A straightforward residential wall is usually two to four working days plus cure time: a day to dig and set the footing, a day for it to cure, then laying block. Caliche, a grade change, or a permit can add to that, and we tell you which of those applies before we start."]
      ],
      seasons: { peak: "October through April", note: "Large pours and wall work move to early mornings in summer." }
    }
  },

  concrete: {
    label: "Concrete",
    gbp: ["Concrete Contractor", "Paving Contractor"],
    rocClasses: ["CR-9", "A-9", "KB-2"],
    palette: { primary: "#57534E", accent: "#EA580C" },
    fonts: { display: "Oswald", body: "Lato" },
    services: [
      ["Driveways", "Tear-out and replacement or new pour, with a compacted base and control joints where they belong."],
      ["Patios & Walkways", "Flatwork sized and jointed so it does not crack through the middle in two years."],
      ["Pool Decks", "Pool decking with a cool-deck or textured finish that is walkable barefoot in July."],
      ["Foundations & Slabs", "Footings, stem walls and slabs for additions, casitas, shops and equipment pads."],
      ["Concrete Repair", "Spalling, settled sections and trip hazards cut out and replaced, or resurfaced where that holds."],
      ["Decorative Concrete", "Stamped, stained and broom finishes, with a sealer rated for Arizona UV."]
    ],
    az: {
      concerns: [
        "A slab poured at two in the afternoon in July cures wrong. Summer pours start at first light, and we will say so when we schedule.",
        "Caliche subgrade has to be ripped and recompacted. Pouring straight onto it is why driveways crack in a pattern.",
        "Control joints are not decoration. Spacing them correctly is the difference between a hairline at the joint and a crack across the slab.",
        "Monsoon runoff undercuts flatwork that was poured without thinking about where water goes. We grade for it."
      ],
      faqs: [
        ["When can I drive on a new driveway?", "Foot traffic after about 24 hours, cars after seven days, and anything heavy like an RV or a loaded truck after 28 days. In summer we water-cure or use a curing compound, because concrete that dries too fast in Arizona heat never reaches full strength."],
        ["Why is my driveway flaking on the surface?", "That is spalling, and it usually traces back to too much water in the original mix, finishing while the surface was still bleeding, or no sealer against UV and de-icer. Sometimes it can be resurfaced. If the flaking is deep, replacement is the honest answer and we will tell you which one you have."],
        ["Do you pour in the summer?", "Yes, early. We start at sunrise, keep the mix cool, and cure it properly. We do not pour flatwork in afternoon heat, because the finish and the strength both suffer and you are the one living with it."]
      ],
      seasons: { peak: "October through May", note: "Summer pours are sunrise starts." }
    }
  },

  hvac: {
    label: "HVAC",
    gbp: ["HVAC Contractor", "Air Conditioning Repair Service"],
    rocClasses: ["CR-39", "C-39", "CR-58", "L-39"],
    palette: { primary: "#1E40AF", accent: "#EF4444" },
    fonts: { display: "Outfit", body: "DM Sans" },
    services: [
      ["AC Repair", "Diagnosis and repair on all brands, with the failed part and the reading that condemned it shown to you."],
      ["AC Installation & Replacement", "Right-sized replacements with a load calculation, not a guess off the old nameplate."],
      ["Heat Pumps & Heating", "Heat pump and gas-pack service and replacement for Arizona's short heating season."],
      ["Preventive Maintenance", "Pre-summer tune-ups: coil cleaning, refrigerant charge, capacitor and amp-draw checks."],
      ["Ductwork", "Leak testing, sealing and replacement of duct runs baking in a 150°F attic."],
      ["Thermostats & Zoning", "Smart thermostats and zoning for houses with a hot end and a cold end."]
    ],
    az: {
      concerns: [
        "Equipment here is sized for a 110-115°F design day. A unit sized by rule of thumb runs constantly in July and dies early.",
        "Attics hit 150°F or more. Duct leakage up there is the quietest way to lose a third of the cooling you paid for.",
        "The pre-monsoon window is when systems fail, because that is the first real load of the year. A tune-up in March beats a no-cool call in June.",
        "R-410A is being phased down in favor of R-454B. It changes what a replacement costs and what parts stay available, and you should hear that before you buy."
      ],
      faqs: [
        ["How long does an AC unit last in Arizona?", "Ten to fifteen years, against twenty or more in a mild climate. Our run hours are simply higher. Maintenance moves a unit toward the top of that range, and skipping it moves you toward the bottom."],
        ["Should I repair or replace?", "If the unit is under ten years old and the repair is a capacitor, contactor or fan motor, repair it. If it is over twelve, uses R-22, and needs a compressor or coil, replacement is usually the cheaper answer over three years. We give you both numbers and let you decide."],
        ["When should I get a tune-up?", "March or April, before the first 100-degree week. That is when a weak capacitor or a low charge shows up as a cheap part instead of an emergency call during a heat warning."]
      ],
      seasons: { peak: "May through September", note: "Book maintenance in March; emergency demand spikes with the first 110°F day." }
    }
  },

  plumbing: {
    label: "Plumbing",
    gbp: ["Plumber", "Drain Cleaning Service"],
    rocClasses: ["CR-37", "C-37", "L-37"],
    palette: { primary: "#0369A1", accent: "#22C55E" },
    fonts: { display: "Outfit", body: "DM Sans" },
    services: [
      ["Leak Detection & Repair", "Slab and wall leaks located before anything gets opened up."],
      ["Water Heaters", "Tank and tankless replacement, sized for the house and set up for hard water."],
      ["Drain Cleaning", "Cabling and hydro-jetting, with a camera run so you see what was actually in the line."],
      ["Repipes", "Whole-house repipe for failing galvanized, polybutylene and early CPVC."],
      ["Water Softeners & Filtration", "Softeners and RO systems sized to the local water hardness."],
      ["Fixtures & Faucets", "Sinks, toilets, faucets, hose bibs and pressure regulators replaced properly."]
    ],
    az: {
      concerns: [
        "Phoenix and Tucson water runs very hard. Scale is what kills water heaters, fixtures and tankless units here years early.",
        "Houses here are on slabs, with no basement. A leak under the slab shows up as a warm spot, a jumping meter or a high bill, not a puddle.",
        "Pressure regulators fail quietly, and high city pressure then takes out the appliances downstream of them.",
        "Polybutylene and early-generation CPVC are still in a lot of 1980s and 1990s housing stock here. Both fail at the fitting."
      ],
      faqs: [
        ["How do I know if I have a slab leak?", "The usual signs are a water bill that jumped with no change in use, a warm spot on the floor, the sound of running water with everything off, or a meter that keeps turning. We locate it electronically first, so we open the smallest piece of slab that does the job."],
        ["Is a water softener worth it in Arizona?", "For most homes here, yes. Our water is hard enough that scale shortens the life of water heaters, fixtures and anything tankless. A softener is cheaper than replacing a heater early, and the difference shows up in the fixtures within a few months."],
        ["How long do water heaters last here?", "Eight to twelve years on a tank, and hard water pushes that toward the low end unless it is flushed yearly. If yours is over ten and sitting where a failure would flood finished space, replacing it on your schedule beats replacing it on its own."]
      ],
      seasons: { peak: "Year round", note: "Slab-leak and no-hot-water calls rise in winter; hose-bib and irrigation breaks in summer." }
    }
  },

  electrical: {
    label: "Electrical",
    gbp: ["Electrician", "Electrical Installation Service"],
    rocClasses: ["CR-11", "C-11", "L-11"],
    palette: { primary: "#1E3A8A", accent: "#FBBF24" },
    fonts: { display: "Outfit", body: "DM Sans" },
    services: [
      ["Panel Upgrades", "Service and panel upgrades for added AC load, EV charging or solar."],
      ["Troubleshooting & Repair", "Dead circuits, tripping breakers and failing devices traced to the actual cause."],
      ["EV Chargers", "Level 2 charger installs with the load calculation the permit requires."],
      ["Lighting", "Interior, landscape and security lighting, including retrofits to LED."],
      ["Outlets, Switches & Fans", "Added circuits, GFCI and AFCI protection, ceiling fans and switch work."],
      ["Surge Protection", "Whole-home surge protection ahead of monsoon season."]
    ],
    az: {
      concerns: [
        "Adding a heat pump or an EV charger is a load calculation question before it is a wiring question. We run it and show you the numbers.",
        "Monsoon lightning and utility switching take out electronics. A whole-home surge device costs less than one replaced AC control board.",
        "Interconnect rules differ between TEP in Tucson and APS and SRP in metro Phoenix. We file to the one that actually serves you.",
        "A lot of 1960s and 1970s Arizona housing has aluminum branch wiring. It is not automatically a crisis, but it needs the right connectors."
      ],
      faqs: [
        ["Do I need a panel upgrade for an EV charger?", "Sometimes. It depends on your existing service size and what else is on it, so it is a load calculation, not a guess. Plenty of 200-amp services take a Level 2 charger with load management and no upgrade at all. We run the calculation before we quote."],
        ["Why do my breakers trip in the summer?", "Usually because the circuit is at its limit and heat makes it worse. AC inrush, a failing compressor, or too much on one kitchen circuit will all do it. A breaker that trips repeatedly is doing its job and telling you something upstream needs looking at."],
        ["Is surge protection worth it here?", "For most homes, yes. Monsoon storms and utility switching send spikes down the line, and modern AC units, pool equipment and appliances all have boards that do not survive them. One whole-home device plus point-of-use protection on electronics is the standard setup."]
      ],
      seasons: { peak: "Year round", note: "Surge-protection and generator interest spikes just before monsoon." }
    }
  },

  roofing: {
    label: "Roofing",
    gbp: ["Roofing Contractor", "Roof Repair Service"],
    rocClasses: ["CR-42", "C-42", "L-42"],
    palette: { primary: "#991B1B", accent: "#F59E0B" },
    fonts: { display: "Oswald", body: "Lato" },
    services: [
      ["Tile Roof Underlayment", "Tile lifted and stacked, underlayment replaced, tile reset. The underlayment is what actually fails."],
      ["Flat & Foam Roofing", "Low-slope polyurethane foam and coating systems, including recoats."],
      ["Roof Repair", "Leak tracing and repair on tile, shingle, foam and flat roofs."],
      ["Shingle Roofing", "Tear-off and replacement with shingles rated for Arizona UV and wind."],
      ["Storm Damage", "Monsoon wind and debris damage documented for an insurance claim."],
      ["Roof Inspections", "Pre-purchase and pre-monsoon inspections with a written report and photos."]
    ],
    az: {
      concerns: [
        "On a tile roof the tile is not the waterproofing. The underlayment is, and it is what wears out, usually at twenty to twenty-five years.",
        "Foam roofs need recoating roughly every five years. Skip two cycles and UV takes the foam itself, which is a far bigger bill.",
        "Monsoon wind lifts tile and blows debris into valleys and scuppers. Most leaks we find after a storm started at a blocked drain.",
        "A roof here is under UV load no mild climate ever sees. Materials are rated differently for it, and the cheap option ages visibly faster."
      ],
      faqs: [
        ["My tile roof is leaking. Do I need all new tile?", "Almost never. The tile is a rain shield and a sun shield, but the underlayment beneath it is the waterproof layer, and that is what fails. We lift and stack your existing tile, replace the underlayment, and reset the same tile, replacing only what broke in handling."],
        ["How often does a foam roof need recoating?", "About every five years, depending on the coating and the exposure. The recoat is routine maintenance and priced like it. Letting it go two cycles means UV starts eating the foam, and then you are paying to replace the foam instead of refreshing the coating."],
        ["Will insurance cover my monsoon damage?", "Often, for sudden wind or debris damage, though not for wear. What decides it is documentation. We photograph the damage, write up what failed and why it is storm-related rather than age-related, and give you that in a form an adjuster can work from."]
      ],
      seasons: { peak: "Year round", note: "Inspection and repair demand spikes right before and right after monsoon." }
    }
  },

  landscaping: {
    label: "Landscaping",
    gbp: ["Landscaper", "Landscape Designer"],
    rocClasses: ["CR-21", "C-21", "L-21"],
    palette: { primary: "#065F46", accent: "#84CC16" },
    fonts: { display: "Outfit", body: "DM Sans" },
    services: [
      ["Desert Landscape Design", "Low-water planting plans using species that actually live here."],
      ["Drip Irrigation", "Drip systems and timers installed and repaired, zoned by plant water need."],
      ["Artificial Turf", "Turf installed over a base that drains, with infill rated for Arizona surface heat."],
      ["Pavers & Hardscape", "Patios, walkways, seat walls and fire features on a compacted base."],
      ["Decomposed Granite & Rock", "Granite, rip-rap and boulder placement, graded so the monsoon does not move it."],
      ["Landscape Lighting", "Low-voltage path, uplight and security lighting on a timer."]
    ],
    az: {
      concerns: [
        "Plant selection is the whole job here. A plan built on species that want 20 inches of rain is a plan to replace plants.",
        "Drip emitters clog with our hard water and mineral load. A system nobody maintains is why half the plants on a block are dead.",
        "Artificial turf gets genuinely hot in full sun. We talk honestly about placement, infill and shade before you commit.",
        "Monsoon runoff moves granite and undermines hardscape. Grading and drainage come before the pretty part."
      ],
      faqs: [
        ["What plants actually survive a Phoenix or Tucson summer?", "The reliable list is longer than people expect: desert willow, red bird of paradise, Texas sage, lantana, agave, hesperaloe, mesquite and palo verde. What matters as much as the species is putting high-water and low-water plants on separate irrigation zones, so nothing is drowned or starved by a shared timer."],
        ["How much water does a desert landscape save?", "Converting turf to a planted desert landscape typically cuts outdoor water use substantially, and outdoor use is the larger half of most Arizona household bills. The honest number depends on what you start with and how the irrigation is zoned, so we would rather look at your actual bill than quote a percentage."],
        ["Do you repair irrigation someone else installed?", "Yes, and it is a lot of what we do. Usually it is clogged emitters, a failed valve, a timer nobody reprogrammed after the seasons changed, or a line a previous crew nicked. We test zone by zone and tell you what is worth repairing versus replacing."]
      ],
      seasons: { peak: "October through April", note: "Planting season is fall and early spring; irrigation repair peaks in summer." }
    }
  },

  painting: {
    label: "Painting",
    gbp: ["Painter", "House Painter"],
    rocClasses: ["CR-34", "C-34", "L-34"],
    palette: { primary: "#4C1D95", accent: "#F472B6" },
    fonts: { display: "Poppins", body: "Open Sans" },
    services: [
      ["Exterior Painting", "Stucco, block and trim prepped and coated with products rated for Arizona UV."],
      ["Interior Painting", "Walls, ceilings and trim, with the prep and masking done before the color goes on."],
      ["Elastomeric Coatings", "Elastomeric over stucco to bridge hairline cracks and shed monsoon rain."],
      ["Cabinet Refinishing", "Kitchen and bath cabinets sprayed for a factory-style finish."],
      ["Stucco & Drywall Repair", "Cracks, patches and texture matched before painting."],
      ["Commercial Painting", "Offices, retail and HOA common areas, scheduled around occupancy."]
    ],
    az: {
      concerns: [
        "Arizona UV is what ends an exterior paint job. Here you are repainting every seven to ten years, not every fifteen.",
        "Surface temperature governs the schedule. Paint going onto a 140°F west-facing wall flash-dries and fails, so we chase shade around the house.",
        "Stucco moves and hairline cracks. Elastomeric bridges them; ordinary flat paint telegraphs them straight back within a season.",
        "Most HOAs here hold an approved color palette. We will pull it and submit for you rather than let you find out after."
      ],
      faqs: [
        ["How often should I repaint the outside of my house in Arizona?", "Every seven to ten years for most stucco homes, and sooner on south and west elevations, which take the worst of the sun. Chalky residue on your hand, fading that is uneven between walls, or hairline cracks opening up are the signals it is time."],
        ["Can you paint in the summer?", "Yes, by working the shade. We start on the east side in the morning and follow the shade around, and we stop when the surface is too hot regardless of what the air temperature says. Paint applied to a scorching wall will not bond, and no warranty covers that."],
        ["Is elastomeric worth the extra cost on stucco?", "On stucco that is already showing hairline cracking, usually yes. It is a thicker, flexible film that bridges those cracks and keeps monsoon rain out of the wall. On a newer, sound stucco wall a quality acrylic may be the better value, and we will say which one your house is."]
      ],
      seasons: { peak: "October through May", note: "Exterior work follows the shade in summer; interiors fill the hot months." }
    }
  },

  fencing: {
    label: "Fencing",
    gbp: ["Fence Contractor", "Gate Contractor"],
    rocClasses: ["CR-14", "C-14", "L-14"],
    palette: { primary: "#374151", accent: "#10B981" },
    fonts: { display: "Inter", body: "Source Sans 3" },
    services: [
      ["Block Wall Fencing", "CMU privacy walls on a proper footing, matched to the neighborhood."],
      ["Wrought Iron & View Fence", "Powder-coated iron and view fence, including HOA-compliant styles."],
      ["Pool Barriers", "Pool fencing and self-closing, self-latching gates that meet Arizona barrier code."],
      ["Wood & Composite Fence", "Privacy fencing set in concrete deep enough for monsoon wind."],
      ["Gates & Automation", "Walk gates, RV gates, and operators with keypad or remote access."],
      ["Fence Repair", "Leaning, wind-damaged and rusted-out sections repaired or replaced."]
    ],
    az: {
      concerns: [
        "Arizona pool barrier law is specific about height, gaps, and self-closing, self-latching gates. We build to it, because an inspection failure is your problem otherwise.",
        "Monsoon downbursts flatten wood fences whose posts were set shallow. Depth and concrete are not where to save money here.",
        "Caliche means post holes get drilled or hammered, not shoveled. That is a real line item and we show it up front.",
        "Most HOAs here specify view fence style, color and height. We pull the standard before fabricating."
      ],
      faqs: [
        ["What does Arizona require for a pool fence?", "In broad terms a barrier at least five feet high on the pool side, no gaps a small child fits through, no handholds or footholds that make it climbable, and gates that are self-closing and self-latching with the latch out of a child's reach. Cities add their own details, so we build to your jurisdiction's version and leave you ready for inspection."],
        ["How deep do fence posts need to be here?", "Figure a third of the post height in the ground, concreted, and deeper on a tall privacy fence or an exposed lot. Monsoon downbursts are the real design load in Arizona, and shallow posts are the single most common reason a fence comes down in a storm."],
        ["Block wall or view fence?", "Block for privacy, noise and wind. View fence where you want the mountain or the golf course and the HOA expects it. Plenty of lots end up with both: block on the side yards between neighbors, view fence across the back."]
      ],
      seasons: { peak: "October through May", note: "Repair demand spikes after monsoon storms." }
    }
  },

  flooring: {
    label: "Flooring",
    gbp: ["Flooring Contractor", "Floor Refinishing Service"],
    rocClasses: ["CR-48", "C-48", "L-48"],
    palette: { primary: "#44403C", accent: "#A16207" },
    fonts: { display: "Oswald", body: "Lato" },
    services: [
      ["Tile Installation", "Porcelain, ceramic and stone set over a prepared and flattened slab."],
      ["Luxury Vinyl Plank", "LVP installed with the expansion gap our temperature swing requires."],
      ["Hardwood & Refinishing", "Engineered and solid hardwood install, plus sand and refinish."],
      ["Carpet", "Bedroom and living-area carpet with pad suited to the traffic."],
      ["Slab Preparation", "Grinding, leveling and moisture testing before anything goes down."],
      ["Flooring Repair", "Cracked tile, failed grout and water-damaged sections replaced."]
    ],
    az: {
      concerns: [
        "Everything here goes over a slab. Flatness and moisture testing come first, because no floor fixes a bad substrate.",
        "A slab leak under tile is a flooring job and a plumbing job. We coordinate rather than tiling over an active leak.",
        "LVP moves with temperature, and a closed-up Arizona house in July gets hot. Correct expansion gaps are not optional.",
        "Grout haze and efflorescence come with hard water. We seal and tell you how to clean it without etching it."
      ],
      faqs: [
        ["Can I put wood floors over a slab in Arizona?", "Engineered wood, yes, glued or floated over a properly prepped and moisture-tested slab. Solid hardwood over a slab is riskier and needs a subfloor system. We moisture-test first, because a reading over spec is the single most common reason a wood floor fails here."],
        ["Why did my tile crack in a straight line?", "A straight run of cracked tile usually follows a crack or a control joint in the slab beneath it. The fix is not just replacing tile, it is isolating the movement with a crack-isolation membrane first, or the new tile cracks in the same line."],
        ["Is LVP a good choice for an Arizona house?", "For most homes, yes. It is dimensionally stable enough for our temperature swing, it handles the dust, and it is far more forgiving than wood over a slab. The things that matter are the wear layer thickness and leaving the correct expansion gap at the walls."]
      ],
      seasons: { peak: "Year round", note: "Interior trade, largely weather independent." }
    }
  },

  carpentry: {
    label: "Carpentry",
    gbp: ["Carpenter", "Cabinet Maker"],
    rocClasses: ["CR-9", "C-9", "KB-2"],
    palette: { primary: "#713F12", accent: "#CA8A04" },
    fonts: { display: "Oswald", body: "Lato" },
    services: [
      ["Patio Covers & Ramadas", "Shade structures engineered for wind and permitted where required."],
      ["Pergolas & Shade", "Pergolas and louvered covers sized for the sun angle you actually have."],
      ["Custom Cabinetry", "Kitchen, bath, garage and built-in cabinetry."],
      ["Doors & Windows", "Door and window replacement, including weatherstripping that cuts heat gain."],
      ["Trim & Finish Carpentry", "Baseboard, casing, crown and built-in shelving."],
      ["Framing & Repair", "Framing for additions and repair of sun-damaged or termite-damaged wood."]
    ],
    az: {
      concerns: [
        "A patio cover is a wind structure here. Monsoon downbursts take the ones that were built without engineering or proper attachment.",
        "Shade placement should follow the actual sun angle on your lot. A cover on the wrong elevation is decoration, not relief.",
        "Our dry air shrinks wood that arrived acclimated somewhere humid. We let material sit before we cut finish work.",
        "Exposed wood takes brutal UV. Species choice and finish schedule decide whether it looks right in five years."
      ],
      faqs: [
        ["Do I need a permit for a patio cover?", "In most Arizona jurisdictions, yes, for anything attached or over a certain size, and the plan usually has to show how it handles wind uplift. We handle the submittal. An unpermitted cover becomes your problem at resale or when a storm takes it off the wall."],
        ["What holds up best outdoors in Arizona sun?", "For structure, steel or properly detailed and finished wood. For decking and trim, species and finish matter more than people expect, and a maintained finish schedule matters more than either. We will tell you what the five-year picture looks like for each option rather than just quoting the cheapest."],
        ["Can you match existing trim or cabinets?", "Usually. Profiles can be milled to match and finishes can be matched closely, though an exact match to a finish that has aged in Arizona light is hard and we will say so rather than promise it. On visible work we make a sample first."]
      ],
      seasons: { peak: "October through May", note: "Shade structure demand climbs ahead of summer." }
    }
  },

  excavating: {
    label: "Excavating",
    gbp: ["Excavating Contractor", "Demolition Contractor"],
    rocClasses: ["CR-2", "A-2", "A"],
    palette: { primary: "#422006", accent: "#F97316" },
    fonts: { display: "Oswald", body: "Lato" },
    services: [
      ["Site Excavation", "Digging and over-excavation for footings, pools, additions and shops."],
      ["Caliche Removal", "Caliche ripped, hammered and hauled, priced before we start."],
      ["Trenching", "Utility, irrigation and drainage trenching with Arizona 811 located first."],
      ["Demolition", "Slab, wall, pool and structure demolition with haul-off."],
      ["Grading & Pad Prep", "Rough and finish grade, compaction and building pad preparation."],
      ["Hauling", "Import of fill and base, export of spoils and debris."]
    ],
    az: {
      concerns: [
        "Caliche is the whole conversation. It ranges from workable to needing a hydraulic hammer, and that changes the price honestly, not after the fact.",
        "Arizona 811 Blue Stake is a legal requirement before digging. We file the ticket and wait the clock out.",
        "Spoils have to go somewhere. Haul-off and dump fees are a real line item and we itemize them instead of burying them.",
        "Monsoon turns an open excavation into a pond. We sequence work so holes are not left open into a storm window."
      ],
      faqs: [
        ["What is caliche and why does it affect my price?", "Caliche is a naturally cemented layer of soil and calcium carbonate, common across Arizona, and it ranges from something a backhoe handles to something that needs a hydraulic hammer. It is the single biggest variable in an excavation price here. We probe first where we can, and when we cannot we quote the range and show you which condition you actually hit."],
        ["Do you call Blue Stake?", "Always. Arizona 811 is a legal requirement before any excavation, and we file the ticket and wait out the mark period. A contractor who offers to skip it is offering to make a struck gas or fiber line your liability."],
        ["Do you haul away what you dig out?", "Yes, and it is quoted as its own line so you can see it. Dump fees and trucking are a real share of an excavation cost, and leaving spoils on site is only cheaper if you have somewhere on the property to legally put them."]
      ],
      seasons: { peak: "October through May", note: "Work is sequenced around monsoon storm windows." }
    }
  },

  grading: {
    label: "Grading & Drainage",
    gbp: ["Excavating Contractor", "Land Grading Service"],
    rocClasses: ["CR-2", "A-2", "A-12"],
    palette: { primary: "#44403C", accent: "#D97706" },
    fonts: { display: "Inter", body: "Source Sans 3" },
    services: [
      ["Lot Grading", "Rough and finish grading to a plan that moves water away from the house."],
      ["Drainage Solutions", "Swales, area drains, French drains and dry wells sized for monsoon volume."],
      ["Retention & Basins", "Retention and detention basins built to municipal requirements."],
      ["Pad Preparation", "Compacted building pads with testing where the permit requires it."],
      ["Erosion Control", "Rip-rap, matting and stabilization on slopes that wash."],
      ["Road & Driveway Base", "Base placement and compaction for driveways and access roads."]
    ],
    az: {
      concerns: [
        "Monsoon rain arrives all at once. Drainage here is sized for a short, violent event, not a steady soak.",
        "Most Arizona municipalities require on-site retention. Getting that wrong means a failed final and a redo.",
        "Negative drainage toward a slab is the quiet cause of foundation and stucco problems. It is usually fixable with grade alone.",
        "Compaction testing is cheap compared with settlement under a new slab. We do it where it matters."
      ],
      faqs: [
        ["Why does water pool next to my house after a storm?", "Almost always negative grade, meaning the dirt falls toward the house instead of away from it, often because landscaping was added over the years and built the grade up. The fix is usually regrading to re-establish fall away from the slab, sometimes with an area drain where there is nowhere for the water to go."],
        ["What is on-site retention and do I need it?", "Most Arizona jurisdictions require a property to hold a set volume of stormwater on site rather than pushing it to the street or a neighbor. On a new build or a large addition it is part of the permit. We size the basin to the local requirement and build to the approved plan."],
        ["How is drainage different in Arizona?", "Volume and timing. We can take a large share of the year's rain in a few hours, so systems are sized for a short intense event and for carrying debris, and surfaces have to survive going from bone dry to flowing and back. A design copied from a wetter climate tends to be undersized and clogs."]
      ],
      seasons: { peak: "February through June", note: "Drainage work is best completed before monsoon." }
    }
  },

  sheetrock: {
    label: "Drywall",
    gbp: ["Drywall Contractor", "Drywall Installation Service"],
    rocClasses: ["CR-36", "C-36", "L-36"],
    palette: { primary: "#525252", accent: "#0EA5E9" },
    fonts: { display: "Inter", body: "Source Sans 3" },
    services: [
      ["Drywall Installation", "Hang, tape and finish for additions, remodels and new construction."],
      ["Water Damage Repair", "Cut out, replace and refinish drywall after a roof or plumbing leak."],
      ["Texture Matching", "Knockdown, orange peel and skip trowel matched to the existing wall."],
      ["Patch & Repair", "Holes, cracks, corner bead and settlement cracking repaired invisibly."],
      ["Ceilings", "Popcorn removal, ceiling repair and smooth-finish conversions."],
      ["Stucco Interface", "Interior repairs where stucco cracking has telegraphed through."]
    ],
    az: {
      concerns: [
        "Knockdown texture is close to universal on Arizona walls, and matching it is the whole craft of a patch that disappears.",
        "Most of the drywall damage we repair started as a roof leak or a slab leak. We check that it is actually dry before we close it up.",
        "Settlement cracking at corners is common with our soils. A patch that ignores why it cracked will crack again in the same place.",
        "Dry air flashes joint compound fast. That changes the schedule and how many coats it takes to finish flat."
      ],
      faqs: [
        ["Can you match my existing texture?", "Yes, and in Arizona that usually means knockdown, with orange peel and skip trowel next most common. Matching is about spray pressure, mud consistency and knockdown timing. We do a test panel on larger repairs so you see the match before it goes on the wall."],
        ["My ceiling has a stain. Is that still leaking?", "It might not be, but we check rather than assume. We moisture-meter the area and look above it, because closing up drywall over a wet cavity gets you mold and the same repair twice. If it is still active, the leak gets fixed first."],
        ["Why do the same cracks keep coming back?", "Because the crack is movement, not a surface defect. Corner and seam cracks from soil movement or framing shrinkage will reopen through a simple skim coat. The repair has to re-tape the joint, sometimes with mesh, and that holds."]
      ],
      seasons: { peak: "Year round", note: "Repair volume rises after monsoon roof leaks." }
    }
  },

  general: {
    label: "General Contracting",
    gbp: ["General Contractor", "Home Builder"],
    rocClasses: ["B", "B-1", "B-2", "KB-1", "KB-2", "A"],
    palette: { primary: "#1F2937", accent: "#3B82F6" },
    fonts: { display: "Inter", body: "Source Sans 3" },
    services: [
      ["Room Additions", "Permitted additions from plan through final inspection."],
      ["Kitchen Remodels", "Full kitchen remodels with the trades scheduled so they are not waiting on each other."],
      ["Bathroom Remodels", "Bath remodels including tile, plumbing and ventilation."],
      ["Casitas & ADUs", "Guest houses and accessory dwelling units, permitted to the local ordinance."],
      ["Whole-Home Renovation", "Larger renovations run on one schedule and one point of contact."],
      ["Repairs & Maintenance", "Smaller repair work handled without a three-week wait."]
    ],
    az: {
      concerns: [
        "Permitting differs by jurisdiction here. Phoenix, Tucson, Mesa, Scottsdale and the counties each have their own process, and we work the one you are in.",
        "Casita and ADU rules have changed in Arizona. What is allowed on your lot is worth checking before you design around it.",
        "Summer changes sequencing. Roof and exterior work goes early in the day, interior work fills the afternoon.",
        "Heat and envelope decisions, insulation, glazing, duct location, are where a remodel here either pays you back monthly or does not."
      ],
      faqs: [
        ["Do you pull the permits?", "Yes, as part of the job, and the permit is in our license. We handle submittal, inspections and the final. A contractor asking you to pull an owner-builder permit for work they are doing is shifting their liability onto you."],
        ["How long does a kitchen remodel take?", "Typically six to ten weeks once materials are on site, with demo and rough-in early and cabinets, counters and tile at the end. The honest variables are long-lead items and inspection scheduling. We build the schedule around the long-lead item instead of starting demo and then waiting."],
        ["Can I build a casita on my lot?", "Often, and Arizona rules around accessory dwelling units have been loosening, but it comes down to your zoning, lot size, setbacks and utility capacity. We check what your jurisdiction allows on your specific parcel before anyone draws anything."]
      ],
      seasons: { peak: "Year round", note: "Exterior phases are scheduled around summer heat." }
    }
  }
};

export const TRADES = T;
export const TRADE_KEYS = Object.keys(T);

/** Accepts "Masonry", "masonry", "MASONRY " and returns a canonical key. */
export function tradeKey(input) {
  if (!input) return "general";
  const k = String(input).trim().toLowerCase().replace(/[^a-z]/g, "");
  if (T[k]) return k;
  const alias = {
    hvacr: "hvac", airconditioning: "hvac", ac: "hvac", heating: "hvac",
    plumber: "plumbing", electric: "electrical", electrician: "electrical",
    roof: "roofing", roofer: "roofing", paint: "painting", painter: "painting",
    landscape: "landscaping", landscaper: "landscaping",
    drywall: "sheetrock", plaster: "sheetrock",
    fence: "fencing", floors: "flooring", floor: "flooring",
    cement: "concrete", flatwork: "concrete",
    block: "masonry", brick: "masonry", stone: "masonry",
    excavation: "excavating", dirt: "excavating",
    drainage: "grading", generalcontracting: "general", gc: "general",
    remodeling: "general", construction: "general"
  };
  return alias[k] || "general";
}

export function trade(input) {
  return T[tradeKey(input)];
}

/**
 * Infer a trade from an ROC license class and/or the ROC's own class
 * description. Description wins, because the numeric part of a general
 * class (KB-2, B-1) is not a trade code and misreads badly if treated as one.
 */
const WORDS = [
  [/masonry|block|brick|stone|tuck ?point/, "masonry"],
  [/concrete|flatwork|cement|paving/, "concrete"],
  [/landscap|irrigation|hardscap/, "landscaping"],
  [/electric/, "electrical"],
  [/plumb/, "plumbing"],
  [/air condition|refrigerat|hvac|ventilat|evaporativ|comfort heating|mechanical/, "hvac"],
  [/roof/, "roofing"],
  [/paint|wall covering/, "painting"],
  [/floor|carpet|tile|ceramic/, "flooring"],
  [/fenc/, "fencing"],
  [/carpentr|cabinet|millwork/, "carpentry"],
  [/excavat|trench|demolition/, "excavating"],
  [/grading|drainage|oil surfacing/, "grading"],
  [/drywall|plaster|sheetrock|lath|stucco/, "sheetrock"]
];
const CODES = {
  2: "excavating", 9: "carpentry", 11: "electrical", 14: "fencing", 21: "landscaping",
  31: "masonry", 34: "painting", 36: "sheetrock", 37: "plumbing", 39: "hvac",
  42: "roofing", 48: "flooring", 58: "hvac"
};

export function inferTrade(licenseClass, description) {
  const text = `${description || ""} ${licenseClass || ""}`.toLowerCase();
  for (const [re, t] of WORDS) if (re.test(text)) return t;
  const code = String(licenseClass || "").toUpperCase().trim();
  // KB-1/KB-2/B-1/B-2/B-3/A are general classes. Their digits are not trade codes.
  if (/^(K?B|A)(-|$|\s)/.test(code)) return "general";
  const m = code.match(/^(?:CR|C|R|L)-?(\d+)/);
  if (m && CODES[Number(m[1])]) return CODES[Number(m[1])];
  return "general";
}
