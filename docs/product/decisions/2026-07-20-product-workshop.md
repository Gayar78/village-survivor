# Atelier produit du 20 juillet 2026

Statut : compte rendu des décisions validées pendant l'analyse du prototype historique
et le grilling fonctionnel.

Ce document conserve la trace des décisions prises. En cas de contradiction, les
décisions les plus récentes de cette liste remplacent les réponses intermédiaires.
Leur synthèse normative se trouve dans
[`../product-pillars.md`](../product-pillars.md).

## Cadre de l'analyse historique

1. Le nouveau développement se fait exclusivement dans
   [HidaAkawa/village_survivor](https://github.com/HidaAkawa/village_survivor).
2. [Gayar78/village-survivors-v2](https://github.com/Gayar78/village-survivors-v2)
   est une référence fonctionnelle en lecture seule.
3. Aucun code historique n'est repris par défaut. Seuls des éléments isolés et
   explicitement vérifiés pourraient être réutilisés.
4. Le nouveau cadrage prévaut en cas de contradiction. Il n'existe aucune obligation
   de parité avec le prototype.
5. L'analyse fonctionnelle précède l'implémentation. Ses conclusions doivent être
   validées avant d'influencer le nouveau jeu.
6. Les constats distinguent comportement confirmé, intention probable et
   interprétation.
7. L'exploration du prototype associe analyse statique et tentative de lancement
   bornée. Aucune réparation importante n'est entreprise pour le rendre jouable.
8. Une idée est évaluée selon son apport à l'identité du jeu, sa valeur ludique, sa
   cohérence avec la boucle cible, son coût et son intégration progressive possible.
9. Une intention créative ambiguë est soumise à `Gayar78`. Une intention évidente dans
   le prototype n'a pas besoin d'être redemandée.
10. Les résultats sont versionnés dans `docs/product/legacy-analysis/` avec l'URL et le
    SHA du prototype, sans copier ses fichiers.
11. L'attribution publique utilise uniquement le pseudonyme GitHub `Gayar78`, sans
    information personnelle.
12. L'audit procède par cartographie exhaustive, puis approfondissement des éléments
    prometteurs.

## Piliers de la partie

13. Une partie est one-shot en V1. Personnages, village et progression repartent de
    zéro à la partie suivante.
14. Le jeu alterne une journée d'exploration limitée et une nuit de défense.
15. Les ressources et artefacts les plus intéressants se trouvent plus loin du
    village, où le danger est supérieur et les défenses du village n'aident plus.
16. Aucun personnage n'est rappelé ou téléporté à la tombée de la nuit.
17. La victoire dépend du développement du village, pas d'un simple nombre de nuits.
18. L'objectif de victoire et ses prérequis sont visibles dès le début.
19. La défaite survient si le village est détruit ou si plus aucun personnage ne peut
    être sauvé.

## Victoire et village

20. La V1 possède une seule construction de victoire.
21. Cette construction est le niveau ultime du cœur du village, pas un bâtiment
    indépendant.
22. Le développement du cœur comporte une colonne vertébrale obligatoire et des
    branches facultatives de soins, défense, production ou exploration.
23. Le niveau ultime déclenche une phase d'activation et une vague finale. La victoire
    n'est acquise qu'après avoir survécu à cette activation.
24. Le village régénère modérément les personnages proches, surtout pendant le jour.
    L'effet diminue sous attaque et peut être amélioré.
25. Les défenses permanentes utilisent des emplacements prédéfinis. Des constructions
    tactiques limitées peuvent être placées librement.
26. Une défense permanente financée par un joueur devient propriété du village. Tous
    peuvent la réparer ou l'améliorer avec leurs propres ressources ; la contribution
    initiale reste attribuée.

## Ressources, propriété et transport

27. La proposition intermédiaire d'un stock commun est abandonnée. Les ressources
    appartiennent au personnage qui les a rapportées.
28. Chaque personnage choisit librement comment dépenser son stock ; aucun autre ne
    peut le faire à sa place.
29. Ressources et artefacts transportés partagent une capacité limitée exprimée en
    poids.
30. Au village, les ressources rejoignent un stock personnel sécurisé et ne pèsent
    plus sur le personnage.
31. Ce stock n'est accessible qu'au village. Les constructions éloignées utilisent
    les ressources réellement transportées.
32. Les transferts directs sont volontaires et exigent la proximité des personnages
    ou un dispositif d'échange au village.
33. Un projet collectif possède une réserve dédiée. Chaque joueur peut y contribuer
    volontairement depuis son stock personnel ; les ressources versées sont réservées
    au projet.
34. À la mort définitive, les possessions transportées tombent dans un sac récupérable
    qui ne disparaît pas avec le temps.
35. Le stock sécurisé d'un personnage mort définitivement devient un coffre d'héritage
    accessible aux survivants.

## Artefacts

36. Les artefacts se trouvent dans des lieux remarquables et gardés, pas dans les
    gisements ordinaires.
37. Ils restent la propriété du personnage qui les trouve et peuvent être donnés
    volontairement.
38. Un personnage peut équiper deux artefacts au maximum.
39. Les artefacts peuvent être changés n'importe où ; le combat et la simulation ne
    s'arrêtent pas.
40. Le changement demande une courte canalisation, interrompue par le mouvement ou les
    dégâts.
41. Les artefacts d'un personnage mort définitivement restent récupérables avec ses
    possessions.

## Mort et participation

42. À zéro point de vie, un personnage passe à terre pendant une durée limitée.
43. Un allié peut le relever par une interaction interrompue par le mouvement ou les
    dégâts.
44. À expiration, la mort devient définitive pour la partie.
45. La partie est perdue si tous les personnages sont morts ou à terre sans possibilité
    de relèvement.
46. En solo, tomber à terre mène normalement à la défaite, sauf effet explicite
    d'auto-réanimation.
47. Un joueur définitivement mort devient spectateur sans action de soutien en V1.

## Combat, disciplines et progression

48. Le combat est hybride : capacités automatiques de type *survivor* et petit nombre
    de compétences actives visées ou déclenchées volontairement.
49. Chaque personnage choisit deux disciplines distinctes au début de la partie et ne
    peut pas en changer pendant celle-ci.
50. Le budget historique de « mains » est supprimé ; toute paire distincte est
    autorisée.
51. Les huit disciplines cibles sont Épée, Bouclier, Arc, Marteau, Feu, Foudre,
    Barrière et Soin. Elles sont livrées progressivement.
52. Le premier ensemble à concevoir comprend Épée, Arc, Feu et Barrière.
53. Chaque discipline apporte une capacité automatique, une compétence active et ses
    améliorations.
54. Un personnage possède deux compétences actives maximum, une par discipline.
55. Une amélioration rare peut remplacer une compétence active par une option
    mutuellement exclusive sans ajouter d'emplacement.
56. À chaque niveau, trois améliorations compatibles sont proposées.
57. La montée de niveau ne met jamais le jeu en pause, en solo comme en coopération.
    Les propositions restent disponibles jusqu'au choix.
58. L'expérience doit idéalement reconnaître les contributions récentes réelles :
    dégâts, soins, protections, contrôle et aides mesurables.
59. La proximité sert de solution temporaire si le suivi de contribution est trop
    complexe pour le premier incrément.
60. Les contributeurs reconnus reçoivent initialement une part égale d'expérience.
    Cette règle devra être affinée par les playtests.

## Monde, monstres et cycles

61. Une carte est générée au début d'une partie, reste stable jusqu'à sa fin et change
    entre les parties.
62. La découverte de la carte est progressive et partagée entre les joueurs.
63. Les gisements sont finis et ne se renouvellent pas.
64. La génération garantit assez de ressources pour atteindre la victoire, avec une
    marge pour les erreurs et les stratégies alternatives.
65. Les gardiens de ressources et de trésors restent attachés à leur site.
66. Les autres groupes de monstres dorment pendant la journée et se défendent s'ils
    détectent un personnage.
67. Les joueurs peuvent éliminer préventivement les groupes endormis afin de réduire
    la prochaine vague ; une attaque peut réveiller le groupe proche.
68. La discrétion V1 repose sur le bruit, une zone de perception et une jauge de
    réveil. Courir ou combattre augmente le risque ; marcher le réduit.
69. À la tombée de la nuit, les monstres non gardiens encore vivants convergent vers
    le village.
70. La nuit possède une durée fixe. Elle ne dépend pas de l'élimination de tous les
    assaillants.
71. À l'aube, les survivants cessent l'assaut, retournent dormir dans le monde et
    restent une menace pour les nuits suivantes.
72. Des tanières ou portails persistants produisent à chaque aube les nouveaux groupes
    de la prochaine vague, hors de la vision immédiate des joueurs.
73. Ces sources renforcent progressivement la population selon l'avancement et le
    nombre de personnages. Elles ne sont pas destructibles en V1.

## Décisions encore volontairement ouvertes

- Le nom et la fiction du niveau ultime du cœur du village.
- Les valeurs d'équilibrage : durées, poids transportable, coûts, portées et délais.
- Le contenu précis des branches du village et des artefacts.
- Les seuils exacts de contribution à l'expérience.
- La durée de l'état à terre et de la canalisation de relèvement.
- Le périmètre exact du premier incrément de combat : la dernière question de l'atelier
  a été interrompue et n'a pas reçu de validation.
- Les exigences non fonctionnelles qui ne sont pas déjà imposées par le brief initial
  feront l'objet d'un atelier distinct et plus court.
