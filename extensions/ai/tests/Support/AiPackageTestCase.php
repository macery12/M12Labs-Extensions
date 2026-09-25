<?php

namespace Everest\Tests\Extensions\ai;

use Everest\Tests\TestCase;

/**
 * The base class for this package's unit tests.
 *
 * Package code reaches core only through the SDK, and every interesting SDK
 * facade gates on two things a bare test process does not have: the panel's
 * runtime plan, and rows in the stores the package's configuration lives in.
 * Rather than have fifty tests each remember to arrange both, they are
 * arranged once here -- the equivalent of the module-era situation, where a
 * config file was simply present.
 *
 * Both halves are still available on their own, through
 * {@see InstallsAiPackage} and {@see ConfiguresAiPackage}, for a test that
 * extends something else -- an integration case, say.
 */
abstract class AiPackageTestCase extends TestCase
{
    use ConfiguresAiPackage;
    use InstallsAiPackage;

    public function setUp(): void
    {
        parent::setUp();

        $this->createAiStores();
        $this->installAiPackage();
        $this->aiCommands();
    }
}
