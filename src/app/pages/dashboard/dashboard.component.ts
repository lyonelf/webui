import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef,ChangeDetectorRef } from '@angular/core';
import { CoreService, CoreEvent } from 'app/core/services/core.service';
import { SystemProfiler } from 'app/core/classes/system-profiler';

import { Subject } from 'rxjs';
import { WidgetComponent } from 'app/core/components/widgets/widget/widget.component'; // POC
import { WidgetControllerComponent } from 'app/core/components/widgets/widgetcontroller/widgetcontroller.component'; // POC
import { WidgetPoolComponent } from 'app/core/components/widgets/widgetpool/widgetpool.component';
import { FlexLayoutModule, MediaObserver } from '@angular/flex-layout';

import { RestService,WebSocketService } from '../../services/';
import { DashConfigItem, WidgetLayout } from 'app/core/components/widgets/widgetcontroller/widgetcontroller.component';
import { tween, styler } from 'popmotion';
//import { TextLimiterDirective } from 'app/core/directives/directives/text-limiter/text-limiter.directive';

@Component({
  selector: 'dashboard',
  templateUrl:'./dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
 
  public screenType: string = 'Desktop'; // Desktop || Mobile

  public dashState: DashConfigItem[]; // Saved State
  public activeMobileWidget: DashConfigItem[] = [];
  public availableWidgets: DashConfigItem[] = [];
  public renderedWidgets: number[] = [];
  public hiddenWidgets: number[] = []; 

  //private timer; /****************************** DEMO*/
  public widgetStates: WidgetLayout[] = [];
  public sortOrder: string[]; 
  public isCompact: boolean = false;
  public large: string = "lg";
  public medium: string = "md";
  public small: string = "sm";
  public zPoolFlex:string = "100";
  public noteFlex:string = "23";

  public statsDataEvents:Subject<CoreEvent>;
  private statsEvents: any;
  public tcStats: any;

  public isFooterConsoleOpen: boolean;

  // For widgetsysinfo
  public isHA: boolean; // = false;
  public isFN: boolean = window.localStorage['is_freenas'];
  public sysinfoReady: boolean = false;

  // For CPU widget
  public systemInformation: any;

  // For widgetpool
  public system: any;
  public system_product: string = "Generic";
  public pools: any[]; // = [];
  public volumeData:any; //= {};

  public nics: any[]; // = [];

  public animation = "stop";
  public shake = false;

  public showSpinner: boolean = true;

  constructor(protected core:CoreService, protected ws: WebSocketService, public mediaObserver: MediaObserver, private el: ElementRef, private cdr: ChangeDetectorRef){
    this.statsDataEvents = new Subject<CoreEvent>();

    mediaObserver.media$.subscribe((evt) =>{

      let st = evt.mqAlias == 'xs' ? 'Mobile' : 'Desktop';

      // If leaving .xs screen then reset mobile position
      if(st == 'Desktop' && this.screenType == 'Mobile'){
        this.onMobileBack();
      }

      this.screenType = st;

      // Eliminate top level scrolling 
      let wrapper = (<any>document).querySelector('.fn-maincontent');
      wrapper.style.overflow = this.screenType == 'Mobile' ? 'hidden' : 'auto';
      
    });

  }

  ngAfterViewInit(){
    window.onblur = () => {
      this.stopListeners();
    } 

    window.onfocus = () => {
      this.startListeners();
    }
  }

  onMobileLaunch(evt: DashConfigItem) {
    this.activeMobileWidget = [evt];

    // Transition 
    const vp = this.el.nativeElement.querySelector('.mobile-viewport');
    let viewport = styler(vp);
    const c = this.el.nativeElement.querySelector('.mobile-viewport .carousel');
    let carousel = styler(c);
    const vpw = viewport.get('width'); //600;

    const startX = 0;
    const endX = vpw * -1;

    tween({
      from:{ x: startX },
      to:{ x: endX },
      duration: 250
    }).start(carousel.set);
  }

  onMobileBack() {
    // Transition 
    const vp = this.el.nativeElement.querySelector('.mobile-viewport');
    let viewport = styler(vp);
    const c = this.el.nativeElement.querySelector('.mobile-viewport .carousel');
    let carousel = styler(c);
    const vpw = viewport.get('width'); //600;

    const startX = vpw * -1;
    const endX = 0;

    tween({
      from:{ x: startX },
      to:{ x: endX },
      duration: 250
    }).start({
      update: (v) => { 
        carousel.set(v);
      },
      complete: () => {
        this.activeMobileWidget = [];
      }
    });

  }

  onMobileResize(evt){
    if(this.screenType == 'Desktop'){ return; }
    const vp = this.el.nativeElement.querySelector('.mobile-viewport');
    let viewport = styler(vp);
    const c = this.el.nativeElement.querySelector('.mobile-viewport .carousel');
    let carousel = styler(c);

    const startX = viewport.get('x');
    const endX = this.activeMobileWidget.length > 0 ? evt.target.innerWidth * -1 : 0;

    if(startX !== endX){
      carousel.set('x', endX);
    }
  }

  toggleCompact(){
    this.isCompact = !this.isCompact;

    const updatedStates = this.widgetStates.map((item, index) => {
      let update = Object.assign({}, item);
      update.isCompact = this.isCompact;
      return update;
    });

    this.widgetStates = updatedStates;
    //this.sortOrder = this.widgetStates.map(w => w.weight.toString() );
    this.cdr.detectChanges();
    this.test();

  }

  test(){
    /******************************** DEMO*/

    //const plusOne = () => {
      const clone = Object.assign([], this.widgetStates);
      const updated = clone.map((v) => {
        let cloneV = Object.assign({}, v);
        cloneV.weight = v.weight + 1 == this.widgetStates.length ? 0 : v.weight + 1;
        return cloneV;
      });

      this.widgetStates = updated;
      this.sortOrder = this.widgetStates.map(w => w.weight.toString() );
      this.cdr.detectChanges();
    //}
 
    /******************************** END DEMO*/
  }

  ngOnInit(){

    this.init();

    this.ws.call('system.advanced.config').subscribe((res)=> {
      if (res) {
        this.isFooterConsoleOpen = res.consolemsg;
      }
    });

    if(this.isFN.toString() == 'false'){
      this.ws.call('failover.licensed').subscribe((res)=> {
        if (res) {
          this.isHA = true;
        }
        this.sysinfoReady = true;
      });
    } else {
      this.sysinfoReady = true;
    }

  }

  ngOnDestroy(){
    
    this.stopListeners();
    this.core.unregister({observerClass:this});

    // Restore top level scrolling 
    let wrapper = (<any>document).querySelector('.fn-maincontent');
    wrapper.style.overflow = 'auto';
  }

  init(){

    this.startListeners();

    this.core.register({observerClass:this,eventName:"NicInfo"}).subscribe((evt:CoreEvent) => {
      let clone = Object.assign([],evt.data);
      let removeNics = {};

      // Store keys for fast lookup
      let nicKeys = {};
      evt.data.forEach((item, index) => {
        nicKeys[item.name] = index.toString();
      });
        
      // Process Vlans (attach vlans to their parent)
      evt.data.forEach((item, index) => {
        if(item.type !== "VLAN" && !clone[index].state.vlans){
          clone[index].state.vlans = [];
        }

        if(item.type == "VLAN"){
          let parentIndex = parseInt(nicKeys[item.state.parent]);
          if(!clone[parentIndex].state.vlans) {
            clone[parentIndex].state.vlans = [];
          }

          clone[parentIndex].state.vlans.push(item.state);
          removeNics[item.name] = index;
        }
      })

      // Process LAGGs
      evt.data.forEach((item, index) => {
        if(item.type == "LINK_AGGREGATION" ){
          clone[index].state.lagg_ports = item.lag_ports;
          item.lag_ports.forEach((nic) => {
            // Consolidate addresses 
            clone[index].state.aliases.forEach((item) => { item.interface = nic});
            clone[index].state.aliases = clone[index].state.aliases.concat(clone[nicKeys[nic]].state.aliases);

            // Consolidate vlans
            clone[index].state.vlans.forEach((item) => { item.interface = nic});
            clone[index].state.vlans = clone[index].state.vlans.concat(clone[nicKeys[nic]].state.vlans);
            
            // Mark interface for removal
            removeNics[nic] = nicKeys[nic];
          });
        }
      });

      // Remove NICs from list
      for(let i = clone.length - 1; i >= 0; i--){
        if(removeNics[clone[i].name]){ 
          // Remove
          clone.splice(i, 1)
        } else {
          // Only keep INET addresses
          clone[i].state.aliases = clone[i].state.aliases.filter(address => address.type == "INET" || address.type == 'INET6');
        }
      }
      
      // Update NICs array
      this.nics = clone;

      this.isDataReady();
    });

    this.core.emit({name:"VolumeDataRequest"});
    this.core.emit({name:"NicInfoRequest"});
    this.getDisksData();
  }

  startListeners(){

    this.statsEvents = this.ws.sub("reporting.realtime").subscribe((evt)=>{
      
      if(evt.cpu){
        this.statsDataEvents.next({name:"CpuStats", data:evt.cpu});
      }
      if(evt.virtual_memory){
        this.statsDataEvents.next({name:"MemoryStats", data:evt.virtual_memory});
      }
      if(evt.interfaces){
        const keys = Object.keys(evt.interfaces);
        keys.forEach((key, index) => {
          const data = evt.interfaces[key];
          this.statsDataEvents.next({name:"NetTraffic_" + key, data: data});
        });
      }
    });

  }

  stopListeners(){
    if(!this.statsEvents){ return; }

    // unsubscribe from middleware
    this.statsEvents.complete();
  }

  setVolumeData(evt:CoreEvent){
    let vd = {};

    for(let i in evt.data){
      let avail = null;
      const used_pct = evt.data[i].used.parsed / (evt.data[i].used.parsed + evt.data[i].available.parsed);
      
      if (evt.data[i].children && evt.data[i].children[0]) {
        avail = evt.data[i].children[0].available.parsed;
      }
      let zvol = {
        avail: avail,
        id:evt.data[i].id,
        name:evt.data[i].name,
        used:evt.data[i].used.parsed,
        used_pct: used_pct.toFixed(0) + '%'
      }
      vd[zvol.id] = zvol;
    }
    this.volumeData = vd;
  }

  getDisksData(){

    this.core.register({observerClass: this, eventName: 'PoolData'}).subscribe((evt:CoreEvent) => {
      this.pools = evt.data;
      this.isDataReady();
    });

    this.core.register({observerClass: this, eventName: 'VolumeData'}).subscribe((evt:CoreEvent) => {
      const nonBootPools = evt.data.filter(v => v.id !== 'boot-pool');
      const clone = Object.assign({}, evt);
      clone.data = nonBootPools;
      this.setVolumeData(clone);
      this.isDataReady();
    });

    this.core.register({observerClass: this, eventName: 'SysInfo'}).subscribe((evt:CoreEvent) => {
      if(typeof this.systemInformation == 'undefined'){
        this.systemInformation = evt.data;
        this.core.emit({name: 'PoolDataRequest', sender: this});
      }
    });

    this.core.emit({name: 'SysInfoRequest', sender: this});
  }

  isDataReady(){
    const isReady = this.statsDataEvents && this.pools && this.volumeData && this.nics ? true : false;
    if(isReady){
      this.availableWidgets = this.generateDefaultConfig();
      if(!this.dashState){
        this.dashState = this.availableWidgets;
      }
    }
  }

  generateDefaultConfig(){
    let conf: DashConfigItem[] = [
      {name:'System Information', rendered: true },
    ];

    if(this.isHA){
      conf.push({name:'System Information(Standby)', identifier: 'passive,true', rendered: true })
    }

    conf.push({name:'CPU', rendered: true });
    conf.push({name:'Memory', rendered: true });

    this.pools.forEach((pool, index) => {
      conf.push({name:'Pool', identifier: 'name,' + pool.name, rendered: true })
    });

    this.nics.forEach((nic, index) => {
      conf.push({name:'Interface', identifier: 'name,' + nic.name, rendered: true })
    });

    const initialStates = conf.map((item, index) =>{
      return {name: item.name, weight: index, isCompact: this.isCompact}
    });
    this.widgetStates = initialStates;
    this.sortOrder = this.widgetStates.map(w => w.weight.toString() );
    this.cdr.detectChanges();

    return conf;
  }

  volumeDataFromConfig(item:DashConfigItem){
    const spl = item.identifier.split(',');
    const key = spl[0];
    const value = spl[1];
    
    const pool = this.pools.filter(pool => pool[key] == value);
    return this.volumeData && this.volumeData[pool[0].name] ? this.volumeData[pool[0].name] : console.warn('No volume data available!');; 
  }

  dataFromConfig(item:DashConfigItem){
    let spl;
    let key;
    let value;
    if(item.identifier){
      spl = item.identifier.split(',');
      key = spl[0];
      value = spl[1];
    }

    let data: any;

    switch(item.name.toLowerCase()){
      case 'cpu':
        data = this.statsDataEvents;
      break;
      case 'memory':
        data = this.statsDataEvents;
      break;
      case 'pool':
        data = spl ? this.pools.filter(pool => pool[key] == value) : console.warn("DashConfigItem has no identifier!");
        if(data){ data = data[0];}
      break;
      case 'interface':
        data = spl ? this.nics.filter(nic => nic[key] == value) : console.warn("DashConfigItem has no identifier!");
        if(data){ data = data[0].state;}
      break;
    }

    return data ? data : console.warn('Data for this widget is not available!') ;
  }

  toggleShake(){
    if(this.shake){
      this.shake = false;
    } else if(!this.shake){
      this.shake= true;
    }
  }


}
