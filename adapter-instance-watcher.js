/*******************************************************************************
 * ioBroker-Script: Adapter Instances Watcher
 * https://github.com/Acgua/ioBroker-Script-Adapter-Instances-Watcher/
 * -------------------------------------------------------------------------------------
 * 
 * ABHÄNGIGKEITEN (Dependencies)
 *  - Erfordert "cron-parser" als zusätzliches NPM-Modul in den JavaScript-Adapter-Einstellungen.
 * 
 * ANLEITUNG: https://github.com/Acgua/ioBroker-Script-Adapter-Instances-Watcher/
 * 
 * Version: 0.0.2
 ***************************************************************************************/


/******************************************************
 * Ab hier bitte das Script entsprechend einstellen.
 *****************************************************/

// Pfad, unter dem Datenpunkte erzeugt werden (ohne nachfolgenden Punkt)
const CONF_PATH = '0_userdata.0.System.Adapter-Instanzen';

// Blacklist, also Adapter-Instanzen, die nicht berücksicht werden sollen. 
// Beispiel: const CONF_BLACKLIST = ['admin.0', 'bring.0'];
const CONF_BLACKLIST = [];

// Infos im Log ausgeben
const LOG_INFO = true;

// Für Fehlerbehebung (Debug) und Entwicklung aktivieren.
const LOG_DEBUG = false;

// 18.07.2022 - https://github.com/Acgua/ioBroker-Script-Adapter-Instances-Watcher/issues/1 und https://forum.iobroker.net/post/827939
// In manchen ioBroker-Umgebungen scheint die Abfrage von <Instanz>.info.connection kein Boolean (true/false) zurückzugeben, sondern Strings wie "remeha logger,Klimastation_0" oder "[2]admin, javascript".
// Ich (Acgua) kann es nicht reproduzieren.
// Daher Workaround ab Version 0.0.2. Bei Ausgabe eines Strings wird angenommen, dass es eine Verbindung gibt.
// --
// Wenn folgendes auf true gesetzt ist, wird eine Warnmeldung im Log ausgegeben, sobald ein String und nicht Boolean zurückgegeben wird.
const LOG_WARN_INFO_CONNECTION_NO_BOOLEAN = true;


/***************************************************************************************************************
 ******************************* Ab hier nichts mehr ändern / Stop editing here! *******************************
 ***************************************************************************************************************/

// Global variables
const CRON_PARSER = require('cron-parser');
let GLOBAL_NOT_OPERATING_LIST = []; // adapter instances enabled, but not operating, like: ['bring.0', '...']

/**
 * @class   Main
 * @desc    Main Script Class
 */
class Main {
    constructor() {
        this.instancesList = [];  // array of all adapter instances, like: ['admin.0', 'bring.0', etc.]
        this.aptInstances = {};   // class instances of "ioBroker adapter instances ('admin.0', etc.)"
        this._initAsync();
    }

    async _initAsync() {

        try {

            if (LOG_INFO) log(`Initialisiere Adapter-Instanzen-Script...`);

            /**
             * Create _all states
             */
            // Create states for general info, etc.
            await createStateAsync(`${CONF_PATH}._all.notFunctioningCount`, {name:`Zähler: Eingeschaltete aber nicht funktionierende Instanzen`, type:'number', read:true, write:false, role:'info', def:0});
            // NOTE: Following code line will throw warning in log: Object 0_userdata.0.System.Adapter-Instanzen._all.notFunctioningList is invalid: Default value has to be stringified but received type "object"
            //       However, changing def to stringified throws also warnings, and changing to object does not help either.
            //       Seems to be a JS Adapter bug, still to be verified, before opening an issue in JS Adapter on github.
            await createStateAsync(`${CONF_PATH}._all.notFunctioningList`, {name:`Liste: Eingeschaltete aber nicht funktionierende Instanzen`, type:'array', read:true, write:false, role:'info', def:[]});
            await createStateAsync(`${CONF_PATH}._all.updateAll`, {name:`Alle Instanzen manuell aktualisieren`, type:'boolean', read:false, write:true, role:'button', def:false});

            /**
             * Create all instances (and info, states, etc. by creation of class instances)
             */
            await this._updateAll();

            if (LOG_INFO) log(`...${this.instancesList.length} Adapter-Instanzen instanziiert: ${Object.keys(this.aptInstances).join(', ')}`);


            /**
             * Subscribe to '._all.updateAll'
             */
            on({id:`${CONF_PATH}._all.updateAll`, change:'any', val:true, ack:false}, async (obj) => {
                await this._updateAll();
                if(LOG_INFO) log ('All instances updated...');
                setState(obj.id, {val:true, ack:true}); // confirm
            });

            if(LOG_INFO) log('...Initialisierung erfolgreich abgeschlossen.');


        } catch (error) {
            log(error.stack, 'error');
            return;
        }

    }

    /**
     * 
     */
    async _updateAll() {

        try {

            /**
             * Clear _all states
             */
            await setStateAsync(`${CONF_PATH}._all.notFunctioningCount`, {val:0, ack:true});
            await setStateAsync(`${CONF_PATH}._all.notFunctioningList`, {val:[], ack:true});

            /**
             * Get all adapter instances
             */
            this.instancesList = this.getInstances();
            
            /** 
             * Create class instances for each adapter instance
             */
            for (const lpInst of this.instancesList) {
                delete this.aptInstances[lpInst]; // for updating: we delete the instance first, just in case!
                this.aptInstances[lpInst] = new AdapterInstance(lpInst);
            }

            /**
             * Cleanup: Delete instance states of script if no longer available
             * We expect an .info folder to determine the folder name like 'admin.0'. Please change accordingly. 
             * 
             */
            const processed = []; // to only process instances once, we check against this array (['admin_0', 'bring_0', ...])
            $(CONF_PATH + '.*.info.*').each( async (lpPath) => { 
                const lpInstanceUnderscore = (lpPath.slice(CONF_PATH.length+1)).split('.')[0]; // Ergibt: 'admin_0' vom '0_userdata.0.System.Adapter-Instanzen_2.admin_0.info.alive'
                if (lpInstanceUnderscore === '_all') return;
                const lpInstanceDot = lpInstanceUnderscore.slice(0, lpInstanceUnderscore.length-2) + '.' + lpInstanceUnderscore.slice(-1); // 'admin_0' -> 'admin.0'
                if (! processed.includes(lpInstanceUnderscore)) {
                    processed.push(lpInstanceUnderscore);
                    if (! this.instancesList.includes(lpInstanceDot)) {
                        await deleteObjectAsync(CONF_PATH + '.' + lpInstanceUnderscore, true); // true = recursive
                        log(`Cleanup: Deleted no longer available instance states of '${lpInstanceDot}'.`);
                    }
                }
            });

        } catch (error) {
            log(error.stack, 'error');
            return;
        }

    }


    /**
     * Get all adapter instances
     * @return {array} - ["backitup.0", "backitup.1", "bring.0", .....]
     */
    getInstances() {
        try {
            // Get list of all Adapter instances. Note that this is an object, not an array
            const instanceObjects = $('state[id=system.adapter.*.alive]'); // {"0":"system.adapter.admin.0.alive","1":"system.adapter.alexa2.0.alive"}
            const finalInstances = [];
            for (const key in instanceObjects) {
                let lpInst = instanceObjects[key]; // like "system.adapter.proxmox.0.alive"
                if (! (typeof lpInst === 'string' && lpInst.startsWith('system.adapter.')) ) continue; // object contains other stuff as well, so disregard these 
                if (! existsObject(lpInst)) continue; // Required if an adapter instance was deleted, somehow per $-selector still available!
                lpInst = lpInst.slice(15); // remove "system.adapter."
                lpInst = lpInst.slice(0, -6); // remove ".alive"
                if (CONF_BLACKLIST.includes(lpInst)) continue; // Apply blacklist
                finalInstances.push(lpInst);
            }        
            return finalInstances;
        } catch (error) {
            log(error.stack, 'error');
            return [];
        }
    }
}




/**
 * @class   AdapterInstance
 * @desc    Class for each adapter instance
 */
class AdapterInstance {

    /**
     * Constructor
     * @param {string} instanceId   Instance ID, like "sonos.0"
     */
    constructor(instanceId) {
        
        // Instance Id and path
        this.id  = instanceId;       // like 'sonos.0'
        this.id_ = instanceId.split('.')[0] + '_' + instanceId.split('.')[1]; // like 'sonos_0', so with underscore and not dot '.' as separator
        this.path = CONF_PATH + '.' + this.id_;  // like '0_userdata.0.System.Adapter-Instanzen.sonos_0'

        // From adapter instance object (navigate to ioBroker -> Objects -> system.adapter.<adapter-name>.<instance> and click on pencil on the right)
        this.name = '';
        this.version = '';
        this.enabled = '';
        this.mode = '';       // running mode of instance: 'schedule', 'daemon', etc.
        this.schedule = '';   // 'N/A' if daemon, or a schedule like '*/15 * * * *' if schedule running mode.
        
        // From system.adapter.<instance>.alive and system.adapter.<adapter-name>.<instance>.connected
        this.alive = false; 
        this.connected_with_host = false; // from system.adapter.<instance>.connected

        // If daemon: is alive and connection to host and (if applicable) to device/service is given
        // If schedule: if last execution of schedule was successful per scheduled cron.
        this.isFunctioning = false;

        // From <instance>.info.connection. Note: Only a few adapter instances have this state, like cloud, bring, etc.
        this.connected_with_device_service = undefined; 

        // For state subscriptions alive, connected, info.connection
        this.subscr_delay = 1000; // Delay in ms to avoid multiple calls.
        this.subscr_recentChange = Date.now();
        this.subscr_doNotExectute = false;

        // -------------------------------------------------------------------------------------------------------

        // call init function
        this._initAdapterInstanceAsync();

    }


    async _initAdapterInstanceAsync() {

        await this.asyncUpdateInfoVariables();
        await this._asyncCreateStates();
        await this.asyncUpdateStates();
        
        /**
         * Subscribe to following to update on every change
         *  - 'system.adapter.*.alive'
         *  - 'system.adapter.*.connected'
         *  - '<adapter-name>.<instance>.info.connection'
         */
        // Define state ids to subscribe to
        const ids = [`system.adapter.${this.id}.alive`]; // all adapters
        if(this.mode !== 'schedule') {
            ids.push(`system.adapter.${this.id}.connected`); // only for non-schedule adapters
            if (this.connected_with_device_service !== undefined)
                ids.push(`${this.id}.info.connection`); // only for non-schedule adapters which connection to device/service
        }
        on({id:ids, change:'ne', ack:true}, async () => {
            this._initAdapterInstance_StateUpdatesAsync();
        });

        /**********************************
         * Subscribe to '.switch'
         **********************************/
        on({id:this.path+'.switch', change:'any', ack:false}, async (obj) => {
            if(LOG_DEBUG) log(`[DEBUG] ${obj.id} wurde durch User auf ${obj.state.val} (ack:false) gesetzt.`);
            await this.asyncAdapterOnOff(obj.state.val);
        });

        /**********************************
         * Subscribe to '.on' an '.off'
         **********************************/
        on({id:[this.path+'.on', this.path+'.off'], change:'any', val:true, ack:false}, async (obj) => {
            const flag = (obj.id.slice(-3) === '.on') ? true : false; // on: true, off: false
            await this.asyncAdapterOnOff(flag);
            if(LOG_DEBUG) log(`[DEBUG] ${obj.id} wurde durch User auf ${flag} (ack:false) gesetzt.`);
        });

    }

    /**
     * We use a recursive function to avoid multiple calls.
     * If called in less than <this.subscr_delay>ms, we wait <this.subscr_delay>+10ms, and check again, and
     * only execute initially, and finally if no more state changes came in (so just call max. twice)
     */
    async _initAdapterInstance_StateUpdatesAsync() {
        try {
            if (this.subscr_doNotExectute === true) return;
            if (this.subscr_recentChange >= (Date.now() - this.subscr_delay)) {
                // Most recent change was less than <this.subscr_delay> ms ago
                this.subscr_doNotExectute = true;
                this.subscr_recentChange = Date.now();
                await wait(this.subscr_delay + 10); // <this.subscr_delay> + 10ms buffer
                this.subscr_doNotExectute = false;
                this._initAdapterInstance_StateUpdatesAsync(); // call function recursively again to check if
            } else {
                // Most recent change was more than <delay> ms ago
                this.subscr_recentChange = Date.now();
                this.subscr_doNotExectute = false;
                // Finally: execute
                if (LOG_DEBUG) log('_initAdapterInstance_StateUpdatesAsync(): Update ' + this.id, 'warn');
                await this.asyncUpdateInfoVariables();
                await this.asyncUpdateStates();
            }
        } catch(error) {
            log(error.stack, 'error');
            return;
        }
    }



    /**
     * Get and update adapter instance info
     */
    async asyncUpdateInfoVariables() {

        try {

            const infoObj = await this.asyncGetInstanceInfoObject();
            this.name     = infoObj.common.name;
            this.version  = infoObj.common.version;
            this.enabled  = infoObj.common.enabled;
            this.mode     = infoObj.common.mode;
            this.schedule = infoObj.common.schedule;

            if(this.mode !== 'schedule') {

                const aliveObj = await getStateAsync(`system.adapter.${this.id}.alive`);
                this.alive = aliveObj.val;
                
                const connObj = await getStateAsync(`system.adapter.${this.id}.connected`);
                this.connected_with_host = connObj.val;

                if (await existsStateAsync(`${this.id}.info.connection`)) {
                    const infConnObj = await getStateAsync(`${this.id}.info.connection`);
                    this.connected_with_device_service = infConnObj.val;

                    // 18.07.2022
                    // Workaround, as in some circumstances a string like "remeha logger,Klimastation_0" or "[2]admin, javascript" may be returned.
                    // See https://github.com/Acgua/ioBroker-Script-Adapter-Instances-Watcher/issues/1
                    if (typeof infConnObj.val === 'boolean') {
                        this.connected_with_device_service = infConnObj.val;
                    } else if (typeof infConnObj.val === 'string' && infConnObj.val.length > 1) {
                        // If string, then we assume connection is given
                        this.connected_with_device_service = true;
                        if (LOG_WARN_INFO_CONNECTION_NO_BOOLEAN) log(`${this.id}.info.connection returns String "${infConnObj.val}", but boolean expected. We assume connection is true and continue.`, 'warn');
                    } else {
                        // No string (or empty), no boolean, so we assume no connection is given.
                        this.connected_with_device_service = false;
                        if (LOG_WARN_INFO_CONNECTION_NO_BOOLEAN) log(`${this.id}.info.connection returns ${typeof infConnObj.val}, Value="${JSON.stringify(infConnObj.val)}", but boolean expected. We assume connection is false and continue.`, 'warn');
                    }
                }
            }

            /**
             * Is functioning status
             * Do after everything else!
             */
            this.isFunctioning = await this.asyncIsInstanceFunctioning(); // Daemon: if alive and connected, Schedule: if being executed successfully        
            
            if (!this.enabled) {
                // Only enabled instances
                GLOBAL_NOT_OPERATING_LIST = GLOBAL_NOT_OPERATING_LIST.filter(e => e !== this.id); // Entfernt "this.id", wenn vorhanden. Siehe https://stackoverflow.com/questions/3954438/how-to-remove-item-from-array-by-value
                GLOBAL_NOT_OPERATING_LIST.sort();                
            } else {
                if (this.isFunctioning) {
                    GLOBAL_NOT_OPERATING_LIST = GLOBAL_NOT_OPERATING_LIST.filter(e => e !== this.id); // Entfernt "this.id", wenn vorhanden. Siehe https://stackoverflow.com/questions/3954438/how-to-remove-item-from-array-by-value
                    GLOBAL_NOT_OPERATING_LIST.sort();
                } else {
                    if (! GLOBAL_NOT_OPERATING_LIST.includes(this.id)) {
                        GLOBAL_NOT_OPERATING_LIST.push(this.id);
                        GLOBAL_NOT_OPERATING_LIST.sort();
                    }
                }
            }

        } catch (error) {
            log(error.stack, 'error');
            return;
        }

    }

    /**
     * Update Instance States, etc.
     */
    async asyncUpdateStates() {

        try {

            /**
             * Update _all states
             */
            await setStateAsync(`${CONF_PATH}._all.notFunctioningList`, {val:GLOBAL_NOT_OPERATING_LIST, ack:true});
            await setStateAsync(`${CONF_PATH}._all.notFunctioningCount`, {val:GLOBAL_NOT_OPERATING_LIST.length, ack:true});

            /**
             * Update instance states
             */

            // Set states. No need for async, just fire
            setState(this.path + '.info.name',     {val:this.name,          ack:true});
            setState(this.path + '.info.version',  {val:this.version,       ack:true});
            setState(this.path + '.info.mode',     {val:this.mode,          ack:true});        
            setState(this.path + '.info.enabled',  {val:this.enabled,       ack:true});
            setState(this.path + '.isFunctioning', {val:this.isFunctioning, ack:true});   
            setState(this.path + '.switch',        {val:this.enabled,      ack:true});
            if(this.enabled) {
                setState(this.path + '.on',  {val:true, ack:true});
                setState(this.path + '.off', {val:false, ack:true});
            } else {
                setState(this.path + '.on',  {val:false, ack:true});
                setState(this.path + '.off', {val:true, ack:true});                
            }


            if(this.mode === 'schedule') {
                setState(this.path + '.info.schedule', {val:this.schedule,    ack:true});   
            } else {
                setState(this.path + '.info.alive', {val:this.alive,   ack:true});
                setState(this.path + '.info.connected_with_host', {val:this.connected_with_host,   ack:true});
                if(this.connected_with_device_service !== undefined) {
                    setState(this.path + '.info.connected_with_device_service', {val:this.connected_with_device_service, ack:true});
                }
            }


        } catch (error) {
            log(error.stack, 'error');
            return;
        }

    }


    /**
     * Create states
     */
    async _asyncCreateStates() {

        try {

            await createStateAsync(this.path + '.info.name',        {name:`Name`, type:'string', read:true, write:false, role:'info', def:''});
            await createStateAsync(this.path + '.info.version',     {name:`Version`, type:'string', read:true, write:false, role:'info', def:''});        
            await createStateAsync(this.path + '.info.enabled',     {name:`Ist Instanz ein- oder ausgeschaltet?`, type:'boolean', read:true, write:false, role:'info', def:false});
            await createStateAsync(this.path + '.info.mode',        {name:`Running Mode of instance (daemon, subscribe, schedule, once, none)`, type:'string', read:true, write:false, role:'info', def:''});
            if (this.mode === 'schedule') {
                await createStateAsync(this.path + '.info.schedule', {name:`Schedule`, type:'string', read:true, write:false, role:'info', def:''});
                await createStateAsync(this.path + '.isFunctioning', {name:`If enabled and most recent schedule was executed successfully`, type:'boolean', read:true, write:false, role:'info', def:false});
            } else {
                await createStateAsync(this.path + '.info.alive',   {name:`from system.adapter.${this.id}.alive`, type:'boolean', read:true, write:false, role:'info', def:false});
                await createStateAsync(this.path + '.info.connected_with_host',{name:`from system.adapter.${this.id}.connected`, type:'boolean', read:true, write:false, role:'info', def:false});
                await createStateAsync(this.path + '.info.connected_with_device_service',{name:`from ${this.id}.info.connection`, type:'boolean', read:true, write:false, role:'info', def:false});
                await createStateAsync(this.path + '.isFunctioning', {name:`If alive and connected to host and device/service (if applicable)`, type:'boolean', read:true, write:false, role:'info', def:false});
            }
            // Create more states
            await createStateAsync(this.path + '.on',      {name:`Instanz einschalten (oder Neustart falls bereits an). Zeigt auch immer aktuellen Status an.`, type:'boolean', read:false, write:true, role:'button', def:false});
            await createStateAsync(this.path + '.off',     {name:`Instanz ausschalten. Zeigt auch immer aktuellen Status an.`, type:'boolean', read:false, write:true, role:'button', def:false});
            await createStateAsync(this.path + '.switch',  {name:`Instanz ein- oder ausschalten. Zeigt auch immer aktuellen Status an.`, type:'boolean', read:true, write:true, role:'switch', def:false});

        } catch (error) {
            log(error.stack, 'error');
            return;
        }

    }


    /**
     * Is a certain adapter instance up and running?
     * TODO: also include other running modes.
     * @return {Promise<boolean>} true if adapter is actively running, false if not.
     */
    async asyncIsInstanceFunctioning() {

        try {

            let isAlive = false;
            if (!this.enabled) return false; // if instance is turned off

            if (this.mode === 'daemon') {
                // In case of (re)start, connection may take some time. We take 3 attempts.
                // Attempt 1/3 - immediately
                if (await daemonConnectedAndAlive(this.id)) {
                    isAlive = true;
                } else {
                    // Attempt 2/3 - after 10 seconds
                    wait(10000);
                    if (await daemonConnectedAndAlive(this.id)) {
                        isAlive = true;
                    } else {
                        // Attempt 3/3 - after 20 seconds in total
                        wait(10000);
                        if (await daemonConnectedAndAlive(this.id)) {
                            isAlive = true;
                        } else {
                            // Finally, no success
                            isAlive = false; // this line is actually not needed, as already set to false
                        }
                    }
                }
                return isAlive;

            } else if (this.mode === 'schedule') {
                // We check for last update
                const objIsAlive = await getStateAsync(`system.adapter.${this.id}.alive`);
                const lastUpdateSecsAgo = Math.floor( (Date.now() - objIsAlive.ts)/1000 ); // Last update of state in seconds
                const lastCronRunSecs = Math.floor(this.getPreviousCronRun(this.schedule)/1000); // if executed at 10:05, "*/15 * * * *" would return 5minutes in ms
                const diff = (lastCronRunSecs-lastUpdateSecsAgo);
                if (diff > -300) {
                    // We allow 300 seconds (5 minutes) difference
                    isAlive = true;
                }
                return isAlive;
            } else {
                // TODO: Also include other modes
                log(`Running mode '${this.mode}' of adapter '${this.id}' is not supported by script!`, 'warn');
                return false;
            }

            async function daemonConnectedAndAlive(instId) {
                const objIsAlive =             await getStateAsync(`system.adapter.${instId}.alive`);
                const objIsConnectedWithHost = await getStateAsync(`system.adapter.${instId}.connected`);
                let isConnectedWithDeviceService = true; // not all instances have this state, so set to true per default
                if (await existsStateAsync(`${instId}.info.connection`)) {
                    const infConnDevServObj = await getStateAsync(`${instId}.info.connection`);
                    isConnectedWithDeviceService = infConnDevServObj.val;
                }
                if ( objIsAlive.val && objIsConnectedWithHost.val && isConnectedWithDeviceService) {
                    return true;
                } else {
                    return false;
                }
            }


        } catch (error) {
            log(error.stack, 'error');
            return false;
        }

    }


    /**
     * Get adapter information or instance information. 
     * 18.06.2022
     * @return {Promise<any>} Adapter instance info object. 
     *                        In ioBroker objects, navigate to system.adapter.<adapter>.<instance> and click on the pencil symbol 
     *                        on the right to see what you will get.
     *                        Example: 'common.mode' = running mode of adapter (daemon, schedule, etc.), 
     */
    async asyncGetInstanceInfoObject() {
        try {
            const path = 'system.adapter.' + this.id;
            const isObjectExisting = await existsObjectAsync(path);
            if (!isObjectExisting) {
                const errorMsg = `Adapter object '${path}' does not exist for given id '${this.id}'.`;
                log(errorMsg, 'warn');
                return 'SCRIPT ERROR: ' + errorMsg;
            }
            return await getObjectAsync('system.adapter.' + this.id);
        } catch (error) {
            log(error.stack, 'error');
            return;
        }
    }


    /**
     * Get previous run of cron job schedule
     * Requires cron-parser!
     * Inspired by https://stackoverflow.com/questions/68134104/
     * @param  {string} expression
     * @return {number} milliseconds to previous run (calculated)
     */
    getPreviousCronRun(expression) {
        try {
            // @ts-ignore - parseExpression works
            const interval = CRON_PARSER.parseExpression(expression);
            const previous = interval.prev();
            return Math.floor(Date.now() - previous.getTime()); // in ms
        } catch (error) {
            log(error.stack, 'error');
            return;
        }
    }

    /**
     * Adapter einschalten/neu starten oder ausschalten
     * @param {boolean} flag - true für Einschalten oder Neustart (falls bereits eingeschaltet), false für Ausschalten
     * @return {Promise<boolean>} true if successful, false if not.
     */
    async asyncAdapterOnOff(flag) {

        try {

            // If running type is schedule, we will switch off adapter first, then turn on.
            if (this.mode === 'daemon') {
                await setStateAsync(`system.adapter.${this.id}.alive`, {val:flag, ack:false});
                log(`Adapter-Instanz ${this.id} (${this.mode}) ${flag ? ' eingeschaltet.': ' ausgeschaltet.'}`);
                return true;
            } else if (this.mode === 'schedule') {

                if (flag === false || this.enabled) {
                    // Falls ausgeschaltet werden soll oder Schedule-Adapter aktiv, also "enabled" ist: immer zuerst ausschalten.
                    await setStateAsync(`system.adapter.${this.id}.alive`, {val:false, ack:false});
                    log(`Adapter-Instanz ${this.id} (${this.mode}) ausgeschaltet.`);
                }

                if (flag) {
                    // Einschalten
                    if (this.enabled) await wait(3000); // wait if was enabled, as turned off before.
                    await setStateAsync(`system.adapter.${this.id}.alive`, {val:true, ack:false});
                    log(`Adapter-Instanz ${this.id} (${this.mode}) eingeschaltet.`);
                }
                return true;

            } else {
                log(`Running mode '${this.mode}' of adapter '${this.id}' is not supported by script!`, 'warn');
                return false;
            }

        } catch (error) {
            log(error.stack, 'error');
            return false;
        }

    }



}



// ******************************************************************************************************
new Main(); // Start Script
// ******************************************************************************************************

