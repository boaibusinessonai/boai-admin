// Which database this Admin website talks to (V134). Empty here: the build's own address is used (Dev, and the Admin UAT site).
// Admin › Releases (release-site, Admin) writes this file on the next stage's Admin site, so the same build works on every stage.
// V140: it also carries the stage's Google web client ID (googleClientId); none here = the old Google redirect sign-in.
window.BOAI_STAGE = null
