// Copyright (c) 2017-2018, The Particl Market developers
// Distributed under the GPL software license, see the accompanying
// file COPYING or https://github.com/particl/particl-market/blob/develop/LICENSE

/**
 * MakeServiceCommand
 * -------------------------------------
 *
 */
import { AbstractMakeCommand } from './lib/AbstractMakeCommand';


export class MakeServiceCommand extends AbstractMakeCommand {

    public static command = 'make:service';
    public static description = 'Generate new service';

    public type = 'Service';
    public suffix = 'Service';
    public template = 'service.hbs';
    public target = 'api/services';

}
